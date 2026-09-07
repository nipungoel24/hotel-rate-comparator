import {
  ActivityFailure,
  ActivityCancellationType,
  ApplicationFailure,
  CancellationScope,
  TimeoutFailure,
  isCancellation,
  proxyActivities,
  sleep,
} from '@temporalio/workflow';
import type { SearchRequest } from '@hotel/contracts';
import type {
  SupplierFailureCode,
  SupplierId,
  SupplierOutcome,
} from '@hotel/domain';
import type { SupplierActivities } from '../activities';

const activities = proxyActivities<SupplierActivities>({
  startToCloseTimeout: '6 seconds',
  scheduleToCloseTimeout: '6 seconds',
  heartbeatTimeout: '1 second',
  cancellationType: ActivityCancellationType.TRY_CANCEL,
  retry: {
    maximumAttempts: 3,
    initialInterval: '250 milliseconds',
    backoffCoefficient: 2,
    maximumInterval: '1 second',
    // Unexpected Activity defects must fail the Workflow, not become supplier outcomes.
    nonRetryableErrorTypes: ['Error', 'TypeError', 'RangeError'],
  },
});

export async function supplierBranch(
  supplier: SupplierId,
  search: SearchRequest,
  root: CancellationScope,
): Promise<SupplierOutcome> {
  const activityScope = new CancellationScope();
  const timerScope = new CancellationScope();
  const deadlineEpochMs = Date.now() + 5000; // Temporal's replay-safe clock.
  let deadlineReached = false;
  const pending = activityScope.run(() =>
    activities.fetchSupplier({ supplier, search, deadlineEpochMs }),
  );
  const deadline = timerScope.run(async (): Promise<SupplierOutcome> => {
    await sleep(5000);
    deadlineReached = true;
    activityScope.cancel();
    return { status: 'timed_out', supplier };
  });
  try {
    // race attaches handlers to both promises, including the losing rejection.
    const result = await Promise.race([pending, deadline]);
    if (root.consideredCancelled) await root.cancelRequested;
    return result;
  } catch (error) {
    if (root.consideredCancelled) await root.cancelRequested;
    if (deadlineReached && isCancellation(error))
      return { status: 'timed_out', supplier };
    if (isCancellation(error)) throw error;
    if (!(error instanceof ActivityFailure)) throw error;
    if (error.cause instanceof TimeoutFailure)
      return { status: 'timed_out', supplier };
    if (!(error.cause instanceof ApplicationFailure)) throw error;
    const type = error.cause.type;
    if (type === 'SupplierDeadline') return { status: 'timed_out', supplier };
    let code: SupplierFailureCode;
    switch (type) {
      case 'SupplierHttpError':
        code = 'server_error';
        break;
      case 'SupplierNetworkError':
        code = 'network_error';
        break;
      case 'SupplierInvalidResponse':
        code = 'invalid_response';
        break;
      default:
        throw error;
    }
    return { status: 'failed', supplier, code };
  } finally {
    timerScope.cancel();
    activityScope.cancel();
  }
}
