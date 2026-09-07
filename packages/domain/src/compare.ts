import type { HotelOffer } from './suppliers';

// Total deterministic order: price in cents ascending, then Supplier A before
// Supplier B, then hotelId by UTF-16 code-unit lexical comparison, then name.
// Network completion order and array order play no part.
export function compareHotelOffers(a: HotelOffer, b: HotelOffer): number {
  if (a.priceMinor !== b.priceMinor) return a.priceMinor - b.priceMinor;
  if (a.supplier !== b.supplier) return a.supplier === 'A' ? -1 : 1;
  if (a.hotelId !== b.hotelId) return a.hotelId < b.hotelId ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return 0;
}

export function cheapestOffer(
  offers: readonly HotelOffer[],
): HotelOffer | undefined {
  let best: HotelOffer | undefined;
  for (const offer of offers) {
    if (best === undefined || compareHotelOffers(offer, best) < 0) best = offer;
  }
  return best;
}
