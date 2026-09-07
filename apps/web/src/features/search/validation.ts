import type { SearchRequest } from '@hotel/contracts';

// Client-side validation mirrors the server rules (packages/contracts hotels.ts
// + the API past-date rule) for fast UX only. The server stays authoritative.
// Duplication is intentional and documented: importing the runtime schema
// would pull zod into the web bundle (Architecture.md dependency boundaries).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CITY_PATTERN = /^[\p{L}\p{N}\s.,''\-&()]+$/u;

export function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 0) - 1 &&
    date.getUTCDate() === day
  );
}

// UTC business calendar date, the same expression the API uses for its
// past-date rule; calendar dates never pass through local-time math.
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextDayIso(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map((part) => Number(part));
  const next = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, (day ?? 0) + 1));
  const y = String(next.getUTCFullYear()).padStart(4, '0');
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calendarDayDiff(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export type FieldErrors = {
  city?: string | undefined;
  checkIn?: string | undefined;
  checkOut?: string | undefined;
};

export function validateSearchFields(
  city: string,
  checkIn: string,
  checkOut: string,
  today: string,
): { ok: true; request: SearchRequest } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const trimmedCity = city.trim();
  if (trimmedCity.length < 2 || trimmedCity.length > 100) {
    errors.city = 'Enter a city name between 2 and 100 characters.';
  } else if (!CITY_PATTERN.test(trimmedCity) || !/[\p{L}]/u.test(trimmedCity)) {
    errors.city =
      'City may contain letters, digits, spaces and normal punctuation.';
  }
  if (!DATE_PATTERN.test(checkIn) || !isRealCalendarDate(checkIn)) {
    errors.checkIn = 'Enter a valid check-in date.';
  } else if (checkIn < today) {
    errors.checkIn = 'Check-in cannot be before today.';
  }
  if (!DATE_PATTERN.test(checkOut) || !isRealCalendarDate(checkOut)) {
    errors.checkOut = 'Enter a valid check-out date.';
  } else if (checkOut <= checkIn) {
    errors.checkOut = 'Check-out must be after check-in.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, request: { city: trimmedCity, checkIn, checkOut } };
}
