import { cheapestOffer, compareHotelOffers } from './compare';
import type { HotelOffer, SearchOutcome, SupplierOutcome } from './suppliers';

function failedOrTimedOut(outcome: SupplierOutcome): boolean {
  return outcome.status === 'failed' || outcome.status === 'timed_out';
}

function isEmpty(outcome: SupplierOutcome): boolean {
  // success is non-empty by construction; the check keeps aggregation
  // defensive against an empty success list slipping through.
  return (
    outcome.status === 'empty' ||
    (outcome.status === 'success' && outcome.hotels.length === 0)
  );
}

// Aggregates both supplier outcomes into the globally cheapest valid offer.
// - Any usable offer wins; partial is true only when a supplier failed or
//   timed out while an offer remains.
// - Both suppliers successfully empty -> no_hotels.
// - No offers and at least one failure/timeout -> suppliers_unavailable,
//   because inventory could not be completely checked.
export function aggregateSearch(
  a: SupplierOutcome,
  b: SupplierOutcome,
): SearchOutcome {
  const aBest = a.status === 'success' ? cheapestOffer(a.hotels) : undefined;
  const bBest = b.status === 'success' ? cheapestOffer(b.hotels) : undefined;
  const candidates: HotelOffer[] = [];
  if (aBest !== undefined) candidates.push(aBest);
  if (bBest !== undefined) candidates.push(bBest);
  if (candidates.length > 0) {
    const best = candidates.reduce((current, offer) =>
      compareHotelOffers(offer, current) < 0 ? offer : current,
    );
    return {
      kind: 'result',
      best,
      partial: failedOrTimedOut(a) || failedOrTimedOut(b),
      a,
      b,
    };
  }
  if (isEmpty(a) && isEmpty(b)) return { kind: 'no_hotels', a, b };
  return { kind: 'suppliers_unavailable', a, b };
}
