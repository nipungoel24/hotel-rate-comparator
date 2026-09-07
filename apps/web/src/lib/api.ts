import type {
  ApiErrorCode,
  PublicHotelOffer,
  SearchRequest,
} from '@hotel/contracts';

export interface ApiSuccessResult {
  kind: 'success';
  searchId: string;
  bestOffer: PublicHotelOffer;
  partial: boolean;
}

export interface ApiEmptyResult {
  kind: 'empty';
  searchId: string;
}

export interface ApiErrorResult {
  kind: 'error';
  code: ApiErrorCode;
  searchId?: string;
}

export type ApiSearchResult =
  ApiSuccessResult | ApiEmptyResult | ApiErrorResult;

// Thrown when the network response is not the typed contract this client
// expects; the UI treats it like an unexpected failure.
export class ApiResponseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new ApiResponseError(`Missing ${key}`);
  return value;
}

function parseOffer(value: unknown): PublicHotelOffer {
  if (!isRecord(value)) throw new ApiResponseError('Missing bestOffer');
  const hotelId = requireString(value, 'hotelId');
  const name = requireString(value, 'name');
  const supplier = value['supplier'];
  if (supplier !== 'A' && supplier !== 'B')
    throw new ApiResponseError('Invalid bestOffer.supplier');
  const price = value['price'];
  const priceMinor = value['priceMinor'];
  const currency = value['currency'];
  const priceBasis = value['priceBasis'];
  if (
    typeof price !== 'number' ||
    typeof priceMinor !== 'number' ||
    currency !== 'AUD' ||
    priceBasis !== 'total_stay'
  )
    throw new ApiResponseError('Invalid bestOffer pricing');
  return { hotelId, name, supplier, price, priceMinor, currency, priceBasis };
}

const API_ERROR_CODES: readonly string[] = [
  'VALIDATION_ERROR',
  'SUPPLIERS_UNAVAILABLE',
  'SEARCH_SERVICE_UNAVAILABLE',
  'SEARCH_TIMEOUT',
  'INTERNAL_ERROR',
];

function parseSuccessBody(json: unknown): ApiSuccessResult | ApiEmptyResult {
  if (!isRecord(json)) throw new ApiResponseError('Malformed body');
  const searchId = requireString(json, 'searchId');
  const status = json['status'];
  if (status === 'success') {
    const bestOffer = parseOffer(json['bestOffer']);
    const partial = json['partial'];
    if (typeof partial !== 'boolean')
      throw new ApiResponseError('Missing partial');
    return { kind: 'success', searchId, bestOffer, partial };
  }
  if (status === 'empty') {
    if (typeof json['message'] !== 'string')
      throw new ApiResponseError('Missing empty message');
    return { kind: 'empty', searchId };
  }
  throw new ApiResponseError('Unexpected 200 status');
}

function parseErrorBody(json: unknown): ApiErrorResult {
  if (!isRecord(json)) throw new ApiResponseError('Malformed body');
  const code = json['code'];
  if (typeof code !== 'string' || !API_ERROR_CODES.includes(code))
    throw new ApiResponseError('Unknown error code');
  const searchId = json['searchId'];
  return {
    kind: 'error',
    code: code as ApiErrorCode,
    ...(typeof searchId === 'string' ? { searchId } : {}),
  };
}

export async function searchHotels(
  request: SearchRequest,
  signal: AbortSignal,
): Promise<ApiSearchResult> {
  const response = await fetch('/api/search-hotels', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  const json: unknown = await response.json().catch(() => undefined);
  if (response.status === 200) return parseSuccessBody(json);
  return parseErrorBody(json);
}
