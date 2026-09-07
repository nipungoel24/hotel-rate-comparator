import { normalizePriceToMinor } from './money';

export type SupplierId = 'A' | 'B';
export type SupplierFailureCode =
  'server_error' | 'network_error' | 'timeout' | 'invalid_response';

export interface HotelOffer {
  supplier: SupplierId;
  hotelId: string;
  name: string;
  priceMinor: number; // integer AUD cents for the complete stay
}

// Distinguishable supplier results: success with inventory, a successful
// empty response, a supplier failure, and a branch timeout. Empty inventory
// is never collapsed into a failure, and failures are never collapsed into
// an empty list.
export type SupplierOutcome =
  | { status: 'success'; supplier: SupplierId; hotels: HotelOffer[] }
  | { status: 'empty'; supplier: SupplierId }
  | { status: 'failed'; supplier: SupplierId; code: SupplierFailureCode }
  | { status: 'timed_out'; supplier: SupplierId };

export type SearchOutcome =
  | {
      kind: 'result';
      best: HotelOffer;
      partial: boolean;
      a: SupplierOutcome;
      b: SupplierOutcome;
    }
  | { kind: 'no_hotels'; a: SupplierOutcome; b: SupplierOutcome }
  | { kind: 'suppliers_unavailable'; a: SupplierOutcome; b: SupplierOutcome };

export interface SupplierResponseLike {
  hotels: readonly { hotelId: string; name: string; price: number }[];
}

// Converts a schema-validated supplier response into a domain outcome.
// Expects already validated input (see @hotel/contracts parseSupplierResponse);
// defensive price normalization errors propagate instead of corrupting data.
export function toSupplierOutcome(
  supplier: SupplierId,
  response: SupplierResponseLike,
): SupplierOutcome {
  if (response.hotels.length === 0) return { status: 'empty', supplier };
  const hotels = response.hotels.map((hotel) => ({
    supplier,
    hotelId: hotel.hotelId,
    name: hotel.name,
    priceMinor: normalizePriceToMinor(hotel.price),
  }));
  return { status: 'success', supplier, hotels };
}
