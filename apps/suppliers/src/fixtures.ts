import type { SupplierHotel } from '@hotel/contracts/hotels';

// Deterministic synthetic inventories by city. Arrays are deliberately
// unsorted so consumers must find the minimum instead of trusting row order.
// Documented price relationships:
//   sydney    -> Supplier A cheaper
//   melbourne -> Supplier B cheaper
//   brisbane  -> equal cheapest price; A also has an intra-supplier tie
//   perth     -> both unsorted, several hotels, global minimum in B
// Unknown cities return an empty inventory (a successful empty response).
export type SupplierName = 'A' | 'B';

const inventories: Record<SupplierName, Record<string, SupplierHotel[]>> = {
  A: {
    sydney: [
      { hotelId: 'SYD-A-103', name: 'Harbour View Inn', price: 145.5 },
      { hotelId: 'SYD-A-101', name: 'Circular Quay Hotel', price: 120.0 },
      { hotelId: 'SYD-A-102', name: 'Park Plaza Sydney', price: 189.99 },
    ],
    melbourne: [
      { hotelId: 'MEL-A-101', name: 'Flinders Station Hotel', price: 175.0 },
      { hotelId: 'MEL-A-102', name: 'Yarra View', price: 210.0 },
    ],
    brisbane: [
      { hotelId: 'BNE-A-103', name: 'Botanic Stay', price: 99.95 },
      { hotelId: 'BNE-A-101', name: 'Story Bridge Hotel', price: 99.95 },
      { hotelId: 'BNE-A-102', name: 'Riverside Motel', price: 130.0 },
    ],
    perth: [
      { hotelId: 'PER-A-101', name: 'Swan River Resort', price: 312.0 },
      { hotelId: 'PER-A-103', name: 'Cottesloe Beach House', price: 398.5 },
      { hotelId: 'PER-A-102', name: 'Kings Park Hotel', price: 245.1 },
    ],
  },
  B: {
    sydney: [
      { hotelId: 'SYD-B-202', name: 'Opera House Grand', price: 220.75 },
      { hotelId: 'SYD-B-201', name: 'Bridge Suites', price: 150.0 },
    ],
    melbourne: [
      { hotelId: 'MEL-B-202', name: 'Southbank Suites', price: 195.5 },
      { hotelId: 'MEL-B-201', name: 'Laneway Boutique', price: 160.0 },
    ],
    brisbane: [
      { hotelId: 'BNE-B-201', name: 'City Botanic Lodge', price: 99.95 },
      { hotelId: 'BNE-B-202', name: 'Fortitude Valley Inn', price: 141.25 },
    ],
    perth: [
      { hotelId: 'PER-B-202', name: 'Northbridge Central', price: 288.0 },
      { hotelId: 'PER-B-203', name: 'Beachside Terrace', price: 154.9 },
      { hotelId: 'PER-B-201', name: 'Fremantle Port Hotel', price: 267.75 },
    ],
  },
};

export function inventoryFor(
  supplier: SupplierName,
  city: string,
): SupplierHotel[] {
  const rows = inventories[supplier][city.trim().toLowerCase()];
  return rows === undefined ? [] : [...rows];
}
