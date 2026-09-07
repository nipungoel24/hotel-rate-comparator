import { z } from 'zod';
import type { ZodIssue } from 'zod';

// Phase 2 hotel/search contracts. Schemas run at trust boundaries; they are
// pure and side-effect free so the web build may consume the same types.
export type Currency = 'AUD';
export type PriceBasis = 'total_stay';

export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number; // AUD major units for the total stay, at most two decimals
}

export const MAX_PRICE_MAJOR_UNITS = 1_000_000;

export const priceSchema = z
  .number()
  .finite()
  .positive()
  .max(MAX_PRICE_MAJOR_UNITS)
  .refine(
    (price) => Math.abs(price * 100 - Math.round(price * 100)) < 1e-6,
    'price must have at most two decimal places',
  );

export const supplierHotelSchema = z.strictObject({
  hotelId: z.string().min(1),
  name: z.string().min(1),
  price: priceSchema,
});

export const supplierResponseSchema = z.strictObject({
  hotels: z.array(supplierHotelSchema),
  currency: z.literal('AUD'),
  priceBasis: z.literal('total_stay'),
});

export type SupplierResponse = z.infer<typeof supplierResponseSchema>;

export type SupplierResponseParseResult =
  { ok: true; value: SupplierResponse } | { ok: false; issues: ZodIssue[] };

export function parseSupplierResponse(
  json: unknown,
): SupplierResponseParseResult {
  const parsed = supplierResponseSchema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: parsed.error.issues };
}

export const CITY_PATTERN = /^[\p{L}\p{N}\s.,'’\-&()]+$/u;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const citySchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(
    CITY_PATTERN,
    'city may contain letters, digits, spaces and normal city punctuation',
  )
  .refine(
    (city) => /[\p{L}]/u.test(city),
    'city must contain at least one letter',
  );

export function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 0) - 1 &&
    date.getUTCDate() === day
  );
}

export const calendarDateSchema = z
  .string()
  .regex(DATE_PATTERN, 'expected YYYY-MM-DD')
  .refine(isRealCalendarDate, 'not a real calendar date');

// Shared shape for the supplier GET query and the future API search request.
// Past-date business rules belong to the API (Phase 4); suppliers validate
// shape and ordering only.
export const searchRequestSchema = z
  .strictObject({
    city: citySchema,
    checkIn: calendarDateSchema,
    checkOut: calendarDateSchema,
  })
  .superRefine((request, context) => {
    if (request.checkOut <= request.checkIn) {
      context.addIssue({
        code: 'custom',
        path: ['checkOut'],
        message: 'check-out must be after check-in',
      });
    }
  });

export type SearchRequest = z.infer<typeof searchRequestSchema>;

// ---------------------------------------------------------------------------
// Phase 4 API contracts. Types travel through @hotel/contracts; the runtime
// validateSearchRequest stays in this zod-bearing subpath module so the web
// bundle never gains a zod dependency.
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'SUPPLIERS_UNAVAILABLE'
  | 'SEARCH_SERVICE_UNAVAILABLE'
  | 'SEARCH_TIMEOUT'
  | 'INTERNAL_ERROR';

export interface FieldError {
  field: string;
  message: string;
}

export type PublicSupplierStatus = 'success' | 'empty' | 'failed' | 'timed_out';
export type PublicSupplierFailureCode =
  'server_error' | 'network_error' | 'timeout' | 'invalid_response';

export interface PublicSupplierOutcome {
  status: PublicSupplierStatus;
  supplier: 'A' | 'B';
  code?: PublicSupplierFailureCode;
}

export interface PublicHotelOffer {
  hotelId: string;
  name: string;
  supplier: 'A' | 'B';
  price: number; // AUD major units for consumers, derived from priceMinor
  priceMinor: number; // authoritative integer AUD cents
  currency: 'AUD';
  priceBasis: 'total_stay';
}

export interface SearchSuccessBody {
  status: 'success';
  searchId: string;
  bestOffer: PublicHotelOffer;
  partial: boolean;
  suppliers: { a: PublicSupplierOutcome; b: PublicSupplierOutcome };
}

export interface SearchEmptyBody {
  status: 'empty';
  message: string;
  searchId: string;
}

export interface SearchErrorBody {
  status: 'error';
  code: ApiErrorCode;
  message: string;
  searchId?: string;
}

export interface ValidationErrorBody extends SearchErrorBody {
  code: 'VALIDATION_ERROR';
  searchId: string;
  fields: FieldError[];
}

export type SearchValidationResult =
  { ok: true; value: SearchRequest } | { ok: false; fieldErrors: FieldError[] };

// Authoritative API-boundary validation. `today` is the current calendar date
// (YYYY-MM-DD) in the API's UTC business timezone, injected so the pure rule
// stays deterministic in tests. The supplier-facing schema owns shape and
// ordering checks; the API adds the business past-date rule.
export function validateSearchRequest(
  value: unknown,
  today: string,
): SearchValidationResult {
  const parsed = searchRequestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.issues.map((issue) => ({
        field:
          issue.path.length > 0 && issue.path[0] !== undefined
            ? String(issue.path[0])
            : 'body',
        message: issue.message,
      })),
    };
  }
  if (parsed.data.checkIn < today) {
    return {
      ok: false,
      fieldErrors: [
        { field: 'checkIn', message: 'check-in must not be before today' },
      ],
    };
  }
  return { ok: true, value: parsed.data };
}
