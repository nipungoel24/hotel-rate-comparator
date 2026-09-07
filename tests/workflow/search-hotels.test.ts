import { Worker } from '@temporalio/worker';
import { Harness } from './harness';
import type { ScenarioName } from '../../apps/suppliers/src/scenarios';

let harness: Harness;
beforeAll(async () => {
  harness = await Harness.create();
}, 60000);
afterAll(async () => {
  await harness?.env.teardown();
});

const cases: {
  name: string;
  city?: string;
  a: ScenarioName;
  b: ScenarioName;
  kind: string;
  winner?: string;
  partial?: boolean;
}[] = [
  {
    name: 'W01 S01 A cheaper',
    a: 'normal',
    b: 'normal',
    kind: 'result',
    winner: 'A',
    partial: false,
  },
  {
    name: 'W02 S02 B cheaper',
    city: 'Melbourne',
    a: 'normal',
    b: 'normal',
    kind: 'result',
    winner: 'B',
    partial: false,
  },
  {
    name: 'W03 S03 equal; B completes first',
    city: 'Brisbane',
    a: 'delay',
    b: 'normal',
    kind: 'result',
    winner: 'A',
    partial: false,
  },
  {
    name: 'W04 S04 A fails',
    a: 'server-error',
    b: 'normal',
    kind: 'result',
    winner: 'B',
    partial: true,
  },
  {
    name: 'W05 B fails',
    a: 'normal',
    b: 'server-error',
    kind: 'result',
    winner: 'A',
    partial: true,
  },
  {
    name: 'W06 S05 both fail',
    a: 'server-error',
    b: 'server-error',
    kind: 'suppliers_unavailable',
  },
  {
    name: 'W07 S06 A empty',
    a: 'empty',
    b: 'normal',
    kind: 'result',
    winner: 'B',
    partial: false,
  },
  {
    name: 'W08 S06 B empty',
    a: 'normal',
    b: 'empty',
    kind: 'result',
    winner: 'A',
    partial: false,
  },
  { name: 'W09 S07 both empty', a: 'empty', b: 'empty', kind: 'no_hotels' },
  {
    name: 'S11 empty plus failure',
    a: 'empty',
    b: 'server-error',
    kind: 'suppliers_unavailable',
  },
  {
    name: 'S13 unsorted global minimum',
    city: 'Perth',
    a: 'normal',
    b: 'normal',
    kind: 'result',
    winner: 'B',
    partial: false,
  },
  {
    name: 'W15 S14 malformed plus success',
    a: 'invalid-payload',
    b: 'normal',
    kind: 'result',
    winner: 'B',
    partial: true,
  },
  {
    name: 'W15 S14 both malformed',
    a: 'invalid-payload',
    b: 'invalid-payload',
    kind: 'suppliers_unavailable',
  },
];
test.each(cases)('$name', async (row) => {
  const s = await harness.scenario(row.a, row.b);
  try {
    await s.worker.runUntil(async () => {
      const handle = await s.start(row.city);
      const result = await handle.result();
      expect(result.kind).toBe(row.kind);
      if (result.kind === 'result') {
        expect(result.best.supplier).toBe(row.winner);
        expect(result.partial).toBe(row.partial);
        if (row.city === 'Perth') expect(result.best.hotelId).toBe('PER-B-203');
        if (row.city === 'Brisbane') {
          expect(result.best.hotelId).toBe('BNE-A-101');
          const a = s.requests.find((r) => r.supplier === 'A');
          const b = s.requests.find((r) => r.supplier === 'B');
          expect(b?.finished).toBeLessThan(a?.finished ?? 0);
        }
      }
      expect((await handle.describe()).status.name).toBe('COMPLETED');
      for (const supplier of ['A', 'B'] as const) {
        const scenario = supplier === 'A' ? row.a : row.b;
        const attempts = s.attempts.filter((r) => r.supplier === supplier);
        expect(attempts.map((r) => r.attempt)).toEqual(
          scenario === 'server-error' ? [1, 2, 3] : [1],
        );
        if (scenario === 'invalid-payload') {
          expect(supplier === 'A' ? result.a : result.b).toMatchObject({
            status: 'failed',
            code: 'invalid_response',
          });
        }
      }
      const history = await handle.fetchHistory();
      expect(
        history.events?.filter((e) => e.activityTaskScheduledEventAttributes),
      ).toHaveLength(2);
      expect(
        history.events?.filter((e) => e.timerStartedEventAttributes),
      ).toHaveLength(2);
      expect(
        history.events?.filter((e) => e.timerCanceledEventAttributes),
      ).toHaveLength(2);
    });
  } finally {
    await s.close();
  }
});

test('W11 S09 genuine Temporal attempts 1/2/3, shared deadline, retry policy and replay', async () => {
  const s = await harness.scenario('fail-twice');
  try {
    await s.worker.runUntil(async () => {
      const handle = await s.start();
      expect(await handle.result()).toMatchObject({
        kind: 'result',
        best: { supplier: 'A' },
        partial: false,
      });
      const a = s.attempts.filter((r) => r.supplier === 'A');
      expect(a.map((r) => r.attempt)).toEqual([1, 2, 3]);
      expect(new Set(a.map((r) => r.deadline)).size).toBe(1);
      expect(
        s.requests
          .filter((r) => r.supplier === 'A')
          .map((r) => [r.attempt, r.status]),
      ).toEqual([
        [1, 500],
        [2, 500],
        [3, 200],
      ]);
      const [first, second, third] = a;
      if (!first || !second || !third)
        throw new Error('Missing retry evidence');
      expect(second.started - first.started).toBeGreaterThanOrEqual(200);
      expect(third.started - second.started).toBeGreaterThanOrEqual(450);
      expect(third.settled).toBeLessThanOrEqual(first.deadline);
      const history = await handle.fetchHistory();
      expect(
        history.events?.some(
          (e) => e.activityTaskStartedEventAttributes?.attempt === 3,
        ),
      ).toBe(true);
      const scheduled = history.events?.find(
        (e) => e.activityTaskScheduledEventAttributes,
      )?.activityTaskScheduledEventAttributes;
      expect(scheduled?.retryPolicy).toMatchObject({
        maximumAttempts: 3,
        backoffCoefficient: 2,
      });
      expect(scheduled?.scheduleToCloseTimeout?.seconds?.toString()).toBe('6');
      await Worker.runReplayHistory(
        { workflowBundle: harness.bundle },
        history,
      );
      console.log('RETRY EVIDENCE', JSON.stringify(a));
    });
  } finally {
    await s.close();
  }
});

test('W17 retry exhaustion has no fourth attempt and records maximum-attempt failure', async () => {
  const s = await harness.scenario('server-error');
  try {
    await s.worker.runUntil(async () => {
      const handle = await s.start();
      expect(await handle.result()).toMatchObject({
        a: { status: 'failed', code: 'server_error' },
      });
      expect(
        s.attempts.filter((r) => r.supplier === 'A').map((r) => r.attempt),
      ).toEqual([1, 2, 3]);
      const history = await handle.fetchHistory();
      expect(
        history.events?.some(
          (e) => e.activityTaskFailedEventAttributes?.retryState === 4,
        ),
      ).toBe(true);
    });
  } finally {
    await s.close();
  }
});
