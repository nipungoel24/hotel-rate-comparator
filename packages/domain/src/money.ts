// Money is normalized to integer AUD cents before any comparison. Prices are
// AUD major units with at most two decimals and at most 1,000,000 major units
// (PRD contract); formatted strings are never used as a comparison source.
export const MAX_PRICE_MAJOR_UNITS = 1_000_000;
export const MAX_PRICE_MINOR_UNITS = MAX_PRICE_MAJOR_UNITS * 100;
const MINOR_EPSILON = 1e-6;

export function normalizePriceToMinor(price: number): number {
  if (!Number.isFinite(price)) throw new Error('price must be finite');
  if (price <= 0) throw new Error('price must be positive');
  if (price > MAX_PRICE_MAJOR_UNITS)
    throw new Error('price exceeds the maximum supported amount');
  const minor = Math.round(price * 100);
  if (Math.abs(price * 100 - minor) >= MINOR_EPSILON) {
    throw new Error('price must have at most two decimal places');
  }
  return minor;
}

export function minorToMajor(minor: number): string {
  if (!Number.isInteger(minor) || minor < 1)
    throw new Error('minor units must be a positive integer');
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
}
