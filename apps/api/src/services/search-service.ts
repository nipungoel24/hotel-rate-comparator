import type { Client } from '@temporalio/client';
import type { SearchRequest } from '@hotel/contracts';
import type { SearchOutcome } from '@hotel/domain';

export const SEARCH_WORKFLOW_TYPE = 'searchHotels';
export const SEARCH_EXECUTION_TIMEOUT = '15 seconds';

// Narrow handle surface the route needs. The production gateway wraps a real
// Temporal WorkflowHandle; focused tests substitute controlled fakes so
// disconnect races can be orchestrated deterministically.
export interface WorkflowHandleLike {
  readonly workflowId: string;
  result(): Promise<SearchOutcome>;
  cancel(): Promise<void>;
}

export interface SearchWorkflowGateway {
  start(input: {
    workflowId: string;
    search: SearchRequest;
  }): Promise<WorkflowHandleLike>;
}

// Matches the compiled searchHotels workflow signature without importing
// worker modules into the API workspace. Type-only and erased at runtime.
type SearchHotelsWorkflow = (search: SearchRequest) => Promise<SearchOutcome>;

// Reuses the one shared Temporal Client/Connection established at API startup.
// No connection is opened per request; every search is a workflow.start on the
// already-connected client.
export function createSearchWorkflowGateway(
  client: Client,
  taskQueue: string,
): SearchWorkflowGateway {
  return {
    async start({ workflowId, search }) {
      const handle = await client.workflow.start<SearchHotelsWorkflow>(
        SEARCH_WORKFLOW_TYPE,
        {
          workflowId,
          taskQueue,
          args: [search],
          workflowExecutionTimeout: SEARCH_EXECUTION_TIMEOUT,
          retry: { maximumAttempts: 1 },
        },
      );
      return {
        workflowId: handle.workflowId,
        result: () => handle.result(),
        cancel: () => handle.cancel().then(() => undefined),
      };
    },
  };
}
