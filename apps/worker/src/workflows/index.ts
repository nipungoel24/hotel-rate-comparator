import { workflowInfo } from '@temporalio/workflow';

// Infrastructure probe only. This is not the hotel search workflow.
export async function infrastructureProbe(
  token: string,
): Promise<{ token: string; taskQueue: string; namespace: string }> {
  const info = workflowInfo();
  return { token, taskQueue: info.taskQueue, namespace: info.namespace };
}

export { searchHotels } from './search-hotels.workflow';
