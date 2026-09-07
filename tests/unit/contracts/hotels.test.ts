import { describe, expect, test } from '@jest/globals';
import {
  calendarDateSchema,
  citySchema,
  parseSupplierResponse,
  priceSchema,
  searchRequestSchema,
  supplierResponseSchema,
} from '@hotel/contracts/hotels';

const validHotel = {
  hotelId: 'SYD-A-101',
  name: 'Circular Quay Hotel',
  price: 120.0,
};

function validPayload() {
  return { hotels: [validHotel], currency: 'AUD', priceBasis: 'total_stay' };
}

function payloadWithHotels(
  hotels: unknown,
  extras: Record<string, unknown> = {},
) {
  return { hotels, currency: 'AUD', priceBasis: 'total_stay', ...extras };
}

describe('price schema', () => {
  test.each([120.0, 99.95, 0.01, 1_000_000.0, 154.9])(
    'accepts valid price %p',
    (price) => {
      expect(priceSchema.safeParse(price).success).toBe(true);
    },
  );

  test.each([
    0,
    -1,
    120.005,
    1_000_000.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('rejects invalid price %p', (price) => {
    expect(priceSchema.safeParse(price).success).toBe(false);
  });
});

describe('supplier response schema', () => {
  test('accepts a valid supplier payload', () => {
    const parsed = supplierResponseSchema.safeParse(validPayload());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.hotels).toHaveLength(1);
      expect(parsed.data.currency).toBe('AUD');
      expect(parsed.data.priceBasis).toBe('total_stay');
    }
  });

  test('accepts a valid empty inventory', () => {
    expect(
      supplierResponseSchema.safeParse({
        hotels: [],
        currency: 'AUD',
        priceBasis: 'total_stay',
      }).success,
    ).toBe(true);
  });

  test('rejects a missing hotel id', () => {
    expect(
      supplierResponseSchema.safeParse(
        payloadWithHotels([{ name: 'No Id', price: 120.0 }]),
      ).success,
    ).toBe(false);
  });

  test('rejects a missing hotel name', () => {
    expect(
      supplierResponseSchema.safeParse(
        payloadWithHotels([{ hotelId: 'X', price: 120.0 }]),
      ).success,
    ).toBe(false);
  });

  test('rejects a non-numeric price', () => {
    expect(
      supplierResponseSchema.safeParse(
        payloadWithHotels([{ hotelId: 'X', name: 'Y', price: 'free' }]),
      ).success,
    ).toBe(false);
  });

  test('rejects unexpected currency', () => {
    expect(
      supplierResponseSchema.safeParse(
        payloadWithHotels([validHotel], { currency: 'USD' }),
      ).success,
    ).toBe(false);
  });

  test('rejects unexpected price basis', () => {
    expect(
      supplierResponseSchema.safeParse(
        payloadWithHotels([validHotel], { priceBasis: 'per_night' }),
      ).success,
    ).toBe(false);
  });

  test('rejects non-array hotels and unknown fields', () => {
    expect(
      supplierResponseSchema.safeParse({
        hotels: 'oops',
        currency: 'AUD',
        priceBasis: 'total_stay',
      }).success,
    ).toBe(false);
    expect(
      supplierResponseSchema.safeParse({ ...validPayload(), mystery: true })
        .success,
    ).toBe(false);
  });

  test('rejects non-object payloads', () => {
    expect(supplierResponseSchema.safeParse(null).success).toBe(false);
    expect(supplierResponseSchema.safeParse('text').success).toBe(false);
    expect(supplierResponseSchema.safeParse([validHotel]).success).toBe(false);
  });

  test('parseSupplierResponse reports ok and issues distinctly', () => {
    expect(parseSupplierResponse(validPayload()).ok).toBe(true);
    const bad = parseSupplierResponse({
      hotels: [{ hotelId: 42, name: 'X', price: 'cheap' }],
      currency: 'EUR',
      priceBasis: 'total_stay',
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues.length).toBeGreaterThan(0);
  });
});

describe('city schema', () => {
  test.each([
    'Sydney',
    'New York',
    'St. Kilda',
    "McDonald's",
    'Köln',
    'Los Angeles',
  ])('accepts valid city %p', (city) => {
    expect(citySchema.safeParse(city).success).toBe(true);
  });

  test.each(['A', 'x', '  ', '!!', 'Tokyo!'])(
    'rejects invalid city %p',
    (city) => {
      expect(citySchema.safeParse(city).success).toBe(false);
    },
  );

  test('trims surrounding whitespace', () => {
    const parsed = citySchema.safeParse('  Sydney  ');
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe('Sydney');
  });
});

describe('calendar date schema', () => {
  test.each(['2026-10-12', '2024-02-29', '2030-01-01'])(
    'accepts real calendar dates %p',
    (date) => {
      expect(calendarDateSchema.safeParse(date).success).toBe(true);
    },
  );

  test.each([
    '2026-2-30',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '26-10-12',
    'not-a-date',
  ])('rejects invalid dates %p', (date) => {
    expect(calendarDateSchema.safeParse(date).success).toBe(false);
  });
});

describe('search request schema', () => {
  test('accepts a valid request', () => {
    const parsed = searchRequestSchema.safeParse({
      city: 'Sydney',
      checkIn: '2026-10-12',
      checkOut: '2026-10-15',
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects missing fields and non-string fields', () => {
    expect(
      searchRequestSchema.safeParse({
        checkIn: '2026-10-12',
        checkOut: '2026-10-15',
      }).success,
    ).toBe(false);
    expect(
      searchRequestSchema.safeParse({
        city: ['Sydney'],
        checkIn: '2026-10-12',
        checkOut: '2026-10-15',
      }).success,
    ).toBe(false);
    expect(
      searchRequestSchema.safeParse({
        city: undefined,
        checkIn: '2026-10-12',
        checkOut: '2026-10-15',
      }).success,
    ).toBe(false);
  });

  test('rejects check-out before check-in', () => {
    expect(
      searchRequestSchema.safeParse({
        city: 'Sydney',
        checkIn: '2026-10-15',
        checkOut: '2026-10-12',
      }).success,
    ).toBe(false);
  });

  test('rejects check-out equal to check-in', () => {
    expect(
      searchRequestSchema.safeParse({
        city: 'Sydney',
        checkIn: '2026-10-15',
        checkOut: '2026-10-15',
      }).success,
    ).toBe(false);
  });

  test('rejects impossible check-in dates', () => {
    expect(
      searchRequestSchema.safeParse({
        city: 'Sydney',
        checkIn: '2026-02-30',
        checkOut: '2026-03-02',
      }).success,
    ).toBe(false);
  });
});
