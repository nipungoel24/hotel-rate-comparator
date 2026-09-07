import { describe, expect, test } from '@jest/globals';
import { minorToMajor, normalizePriceToMinor } from '@hotel/domain';

describe('money normalization', () => {
  test('normalizes whole AUD amounts to cents', () => {
    expect(normalizePriceToMinor(120.0)).toBe(12000);
    expect(normalizePriceToMinor(0.01)).toBe(1);
  });

  test('normalizes decimal AUD amounts to cents without floating-point drift', () => {
    expect(normalizePriceToMinor(99.95)).toBe(9995);
    expect(normalizePriceToMinor(0.29)).toBe(29);
    expect(normalizePriceToMinor(154.9)).toBe(15490);
  });

  test('normalizes to exact integer cents rather than drifting doubles', () => {
    expect(normalizePriceToMinor(1.1)).toBe(110);
    expect(normalizePriceToMinor(99.95)).toBe(9995);
    expect(Number.isInteger(normalizePriceToMinor(0.07))).toBe(true);
  });

  test('accepts the maximum supported price', () => {
    expect(normalizePriceToMinor(1_000_000.0)).toBe(100_000_000);
  });

  test('rejects zero, negative and non-finite prices', () => {
    expect(() => normalizePriceToMinor(0)).toThrow();
    expect(() => normalizePriceToMinor(-1)).toThrow();
    expect(() => normalizePriceToMinor(Number.NaN)).toThrow();
    expect(() => normalizePriceToMinor(Number.POSITIVE_INFINITY)).toThrow();
  });

  test('rejects prices above the maximum', () => {
    expect(() => normalizePriceToMinor(1_000_000.01)).toThrow();
  });

  test('rejects prices with more than two decimal places', () => {
    expect(() => normalizePriceToMinor(120.005)).toThrow();
  });

  test('floating-point representation noise does not corrupt money', () => {
    expect(normalizePriceToMinor(0.1 + 0.2)).toBe(normalizePriceToMinor(0.3));
    expect(normalizePriceToMinor(0.1 + 0.2)).toBe(30);
  });

  test('formats cents back to exact major units', () => {
    expect(minorToMajor(12000)).toBe('120.00');
    expect(minorToMajor(9995)).toBe('99.95');
    expect(minorToMajor(1)).toBe('0.01');
    expect(minorToMajor(100_000_000)).toBe('1000000.00');
  });

  test('rejects invalid minor amounts', () => {
    expect(() => minorToMajor(0)).toThrow();
    expect(() => minorToMajor(-5)).toThrow();
    expect(() => minorToMajor(1.5)).toThrow();
  });
});
