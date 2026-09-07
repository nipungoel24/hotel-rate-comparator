import { CancellationScope } from '@temporalio/workflow';
import type { SearchRequest } from '@hotel/contracts';
import { aggregateSearch } from '@hotel/domain';
import type { SearchOutcome } from '@hotel/domain';
import { supplierBranch } from './supplier-branch';

export async function searchHotels(
  search: SearchRequest,
): Promise<SearchOutcome> {
  const root = CancellationScope.current();
  const branches = await Promise.allSettled([
    supplierBranch('A', search, root),
    supplierBranch('B', search, root),
  ]);
  if (root.consideredCancelled) await root.cancelRequested;
  const [a, b] = branches;
  if (a.status === 'rejected') throw a.reason;
  if (b.status === 'rejected') throw b.reason;
  return aggregateSearch(a.value, b.value);
}
