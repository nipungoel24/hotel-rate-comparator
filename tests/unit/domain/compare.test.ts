import { describe, expect, test } from '@jest/globals';
import { cheapestOffer, compareHotelOffers } from '@hotel/domain';
import type { HotelOffer } from '@hotel/domain';

function offer(value: HotelOffer): HotelOffer {
  return value;
}

describe('compareHotelOffers total order', () => {
  test('cheaper price wins regardless of supplier', () => {
    expect(
      compareHotelOffers(
        offer({ supplier: 'B', hotelId: 'x', name: 'x', priceMinor: 10000 }),
        offer({ supplier: 'A', hotelId: 'y', name: 'y', priceMinor: 20000 }),
      ),
    ).toBeLessThan(0);
  });

  test('equal price: Supplier A wins over Supplier B (S03 tie-break)', () => {
    expect(
      compareHotelOffers(
        offer({
          supplier: 'A',
          hotelId: 'z-last',
          name: 'z-name',
          priceMinor: 9995,
        }),
        offer({
          supplier: 'B',
          hotelId: 'a-first',
          name: 'a-name',
          priceMinor: 9995,
        }),
      ),
    ).toBeLessThan(0);
  });

  test('equal price and supplier: hotelId lexical comparison', () => {
    expect(
      compareHotelOffers(
        offer({
          supplier: 'A',
          hotelId: 'BNE-A-101',
          name: 'z',
          priceMinor: 9995,
        }),
        offer({
          supplier: 'A',
          hotelId: 'BNE-A-103',
          name: 'a',
          priceMinor: 9995,
        }),
      ),
    ).toBeLessThan(0);
  });

  test('equal price, supplier and hotelId: name comparison', () => {
    expect(
      compareHotelOffers(
        offer({
          supplier: 'A',
          hotelId: 'same',
          name: 'Alpha',
          priceMinor: 9995,
        }),
        offer({
          supplier: 'A',
          hotelId: 'same',
          name: 'Beta',
          priceMinor: 9995,
        }),
      ),
    ).toBeLessThan(0);
  });

  test('identical offers compare equal', () => {
    const a = offer({
      supplier: 'A',
      hotelId: 'same',
      name: 'same',
      priceMinor: 9995,
    });
    expect(compareHotelOffers(a, a)).toBe(0);
  });

  test('comparison never depends on array order', () => {
    const a = offer({
      supplier: 'A',
      hotelId: 'a',
      name: 'a',
      priceMinor: 15000,
    });
    const b = offer({
      supplier: 'B',
      hotelId: 'b',
      name: 'b',
      priceMinor: 10000,
    });
    expect(compareHotelOffers(a, b)).toBeGreaterThan(0);
    expect(compareHotelOffers(b, a)).toBeLessThan(0);
  });
});

describe('cheapestOffer within one supplier result', () => {
  test('finds the minimum of an unsorted list (S13)', () => {
    const hotels = [
      offer({ supplier: 'A', hotelId: '3', name: 'third', priceMinor: 31200 }),
      offer({ supplier: 'A', hotelId: '1', name: 'first', priceMinor: 12000 }),
      offer({ supplier: 'A', hotelId: '2', name: 'second', priceMinor: 24510 }),
    ];
    expect(cheapestOffer(hotels)?.hotelId).toBe('1');
  });

  test('does not trust the first row when it is not the cheapest', () => {
    const hotels = [
      offer({
        supplier: 'B',
        hotelId: 'PER-B-202',
        name: 'Northbridge Central',
        priceMinor: 28800,
      }),
      offer({
        supplier: 'B',
        hotelId: 'PER-B-203',
        name: 'Beachside Terrace',
        priceMinor: 15490,
      }),
    ];
    expect(cheapestOffer(hotels)?.priceMinor).toBe(15490);
  });

  test('equal cheapest prices break by hotelId, not row order', () => {
    const hotels = [
      offer({
        supplier: 'A',
        hotelId: 'BNE-A-103',
        name: 'Botanic Stay',
        priceMinor: 9995,
      }),
      offer({
        supplier: 'A',
        hotelId: 'BNE-A-101',
        name: 'Story Bridge Hotel',
        priceMinor: 9995,
      }),
    ];
    expect(cheapestOffer(hotels)?.hotelId).toBe('BNE-A-101');
  });

  test('returns undefined for an empty list', () => {
    expect(cheapestOffer([])).toBeUndefined();
  });
});
