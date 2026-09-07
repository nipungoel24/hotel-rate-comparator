// Deterministic mock behaviour controls. Scenario selection arrives through
// development/test-only allowlisted headers; the fail-twice mode reads a
// trusted attempt number the caller supplies (Temporal activity info in
// Phase 3). There is no global mutable state, so simultaneous searches are
// isolated by construction and nothing leaks between tests or requests.
export const SCENARIO_HEADER = 'x-hotel-scenario';
export const ATTEMPT_HEADER = 'x-supplier-attempt';

export const SCENARIOS = [
  'normal',
  'empty',
  'server-error',
  'delay',
  'very-slow',
  'hang',
  'fail-twice',
  'invalid-payload',
] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export const DEFAULT_SCENARIO: ScenarioName = 'normal';
export const DEFAULT_ATTEMPT = 1;

export const DEFAULT_DELAY_MS: Record<'A' | 'B', number> = { A: 100, B: 250 };
export const DELAY_MODE_MS = 2500; // controlled delay under the 5-second branch budget
export const VERY_SLOW_MODE_MS = 8000; // deterministic over-deadline response
export const FAIL_TWICE_ATTEMPTS = 3; // 500 for attempts 1-2, success from attempt 3

export function parseScenarioHeader(
  value: string | undefined,
): ScenarioName | null {
  if (value === undefined) return DEFAULT_SCENARIO;
  return (SCENARIOS as readonly string[]).includes(value)
    ? (value as ScenarioName)
    : null;
}

export function parseAttemptHeader(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_ATTEMPT;
  if (!/^\d+$/.test(value)) return null;
  const attempt = Number(value);
  return attempt >= 1 ? attempt : null;
}
