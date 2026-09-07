import { describe, expect, test } from '@jest/globals';
import { aggregateSearch } from '@hotel/domain';
import type {
  HotelOffer,
  SupplierFailureCode,
  SupplierId,
  SupplierOutcome,
} from '@hotel/domain';

function offer(
  supplier: SupplierId,
  hotelId: string,
  name: string,
  priceMinor: number,
): HotelOffer {
  return { supplier, hotelId, name, priceMinor };
}

function success(supplier: SupplierId, hotels: HotelOffer[]): SupplierOutcome {
  return { status: 'success', supplier, hotels };
}

function empty(supplier: SupplierId): SupplierOutcome {
  return { status: 'empty', supplier };
}

function failed(
  supplier: SupplierId,
  code: SupplierFailureCode = 'server_error',
): SupplierOutcome {
  return { status: 'failed', supplier, code };
}

function timedOut(supplier: SupplierId): SupplierOutcome {
  return { status: 'timed_out', supplier };
}

const aCheap = offer('A', 'SYD-A-101', 'Circular Quay Hotel', 12000);
const aPricey = offer('A', 'SYD-A-103', 'Harbour View Inn', 14550);
const bCheap = offer('B', 'MEL-B-201', 'Laneway Boutique', 16000);
const bPricey = offer('B', 'SYD-B-202', 'Opera House Grand', 22075);

describe('aggregateSearch', () => {
  test('S01: A cheapest -> A wins, full success', () => {
    const result = aggregateSearch(
      success('A', [aCheap, aPricey]),
      success('B', [bPricey]),
    );
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best).toEqual(aCheap);
      expect(result.partial).toBe(false);
    }
  });

  test('S02: B cheapest -> B wins, full success', () => {
    const aMostPricey = offer('A', 'SYD-A-102', 'Park Plaza Sydney', 18999);
    const result = aggregateSearch(
      success('A', [aMostPricey]),
      success('B', [bCheap, bPricey]),
    );
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best).toEqual(bCheap);
      expect(result.partial).toBe(false);
    }
  });

  test('S03: equal cheapest price -> Supplier A wins deterministically', () => {
    const aTie = offer('A', 'BNE-A-103', 'Botanic Stay', 9995);
    const bTie = offer('B', 'BNE-B-201', 'City Botanic Lodge', 9995);
    const result = aggregateSearch(success('A', [aTie]), success('B', [bTie]));
    expect(result.kind).toBe('result');
    if (result.kind === 'result') expect(result.best.supplier).toBe('A');
  });

  test('S04: A fails, B succeeds -> B wins with partial=true', () => {
    const result = aggregateSearch(
      failed('A'),
      success('B', [bCheap, bPricey]),
    );
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best).toEqual(bCheap);
      expect(result.partial).toBe(true);
    }
  });

  test('B fails, A succeeds -> A wins with partial=true', () => {
    const result = aggregateSearch(success('A', [aCheap]), failed('B'));
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best).toEqual(aCheap);
      expect(result.partial).toBe(true);
    }
  });

  test('S05: both suppliers fail -> suppliers_unavailable', () => {
    const result = aggregateSearch(failed('A'), failed('B', 'timeout'));
    expect(result.kind).toBe('suppliers_unavailable');
  });

  test('S06: A empty, B has offers -> B wins with partial=false', () => {
    const result = aggregateSearch(empty('A'), success('B', [bCheap]));
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best).toEqual(bCheap);
      expect(result.partial).toBe(false);
    }
  });

  test('B empty, A has offers -> A wins with partial=false', () => {
    const result = aggregateSearch(success('A', [aCheap]), empty('B'));
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best).toEqual(aCheap);
      expect(result.partial).toBe(false);
    }
  });

  test('S07: both suppliers empty -> no_hotels, not a failure', () => {
    const result = aggregateSearch(empty('A'), empty('B'));
    expect(result.kind).toBe('no_hotels');
  });

  test('S11: A fails and B empty -> suppliers_unavailable, never no_hotels', () => {
    const result = aggregateSearch(failed('A'), empty('B'));
    expect(result.kind).toBe('suppliers_unavailable');
  });

  test('S11: B fails and A empty -> suppliers_unavailable, never no_hotels', () => {
    const result = aggregateSearch(empty('A'), failed('B'));
    expect(result.kind).toBe('suppliers_unavailable');
  });

  test('A timed out, B succeeds -> partial=true', () => {
    const result = aggregateSearch(timedOut('A'), success('B', [bCheap]));
    expect(result.kind).toBe('result');
    if (result.kind === 'result') expect(result.partial).toBe(true);
  });

  test('A timed out, B empty -> suppliers_unavailable', () => {
    const result = aggregateSearch(timedOut('A'), empty('B'));
    expect(result.kind).toBe('suppliers_unavailable');
  });

  test('both suppliers time out -> suppliers_unavailable', () => {
    const result = aggregateSearch(timedOut('A'), timedOut('B'));
    expect(result.kind).toBe('suppliers_unavailable');
  });

  test('S13: globally cheapest across two unsorted multi-hotel lists', () => {
    const aHotels = [
      offer('A', 'PER-A-101', 'Swan River Resort', 31200),
      offer('A', 'PER-A-103', 'Cottesloe Beach House', 39850),
      offer('A', 'PER-A-102', 'Kings Park Hotel', 24510),
    ];
    const bHotels = [
      offer('B', 'PER-B-202', 'Northbridge Central', 28800),
      offer('B', 'PER-B-203', 'Beachside Terrace', 15490),
      offer('B', 'PER-B-201', 'Fremantle Port Hotel', 26775),
    ];
    const result = aggregateSearch(
      success('A', aHotels),
      success('B', bHotels),
    );
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best.hotelId).toBe('PER-B-203');
      expect(result.best.priceMinor).toBe(15490);
    }
  });

  test('empty inventory and failure remain distinguishable states', () => {
    expect(empty('A').status).toBe('empty');
    expect(failed('A').status).toBe('failed');
    expect(aggregateSearch(empty('A'), empty('B')).kind).not.toBe(
      aggregateSearch(failed('A'), failed('B')).kind,
    );
  });

  test('result preserves supplier outcomes for API/frontend diagnostics', () => {
    const a = failed('A', 'invalid_response');
    const b = success('B', [bCheap]);
    const result = aggregateSearch(a, b);
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.a).toEqual(a);
      expect(result.b).toEqual(b);
    }
  });

  test('defensive: an empty success list behaves like a successful empty response', () => {
    expect(aggregateSearch(success('A', []), empty('B')).kind).toBe(
      'no_hotels',
    );
  });

  test('deterministic across repeated runs', () => {
    const runs = Array.from(
      { length: 20 },
      () =>
        aggregateSearch(success('A', [aCheap, aPricey]), success('B', [bCheap]))
          .kind,
    );
    expect(runs.every((kind) => kind === 'result')).toBe(true);
  });
});
