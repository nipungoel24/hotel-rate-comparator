import { searchHotels } from '../../apps/web/src/lib/api';
import { ApiResponseError } from '../../apps/web/src/lib/api';

const search = {
  city: 'Sydney',
  checkIn: '2030-10-12',
  checkOut: '2030-10-15',
};

function mockFetch(
  status: number,
  body: unknown,
  options?: { invalidJson?: boolean },
) {
  const json = options?.invalidJson
    ? Promise.reject(new Error('bad json'))
    : Promise.resolve(body);
  const fetchMock = jest.fn().mockResolvedValue({
    status,
    json: () => json,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('searchHotels API client', () => {
  test('parses a complete success response', async () => {
    mockFetch(200, {
      status: 'success',
      searchId: 'hotel-search-1',
      bestOffer: {
        hotelId: 'SYD-A-101',
        name: 'Circular Quay Hotel',
        supplier: 'A',
        price: 120,
        priceMinor: 12000,
        currency: 'AUD',
        priceBasis: 'total_stay',
      },
      partial: false,
      suppliers: { a: { status: 'success', supplier: 'A' } },
    });
    const result = await searchHotels(search, new AbortController().signal);
    expect(result).toEqual({
      kind: 'success',
      searchId: 'hotel-search-1',
      bestOffer: {
        hotelId: 'SYD-A-101',
        name: 'Circular Quay Hotel',
        supplier: 'A',
        price: 120,
        priceMinor: 12000,
        currency: 'AUD',
        priceBasis: 'total_stay',
      },
      partial: false,
    });
  });

  test('parses an empty response', async () => {
    mockFetch(200, {
      status: 'empty',
      message: 'No hotels found',
      searchId: 'hotel-search-2',
    });
    const result = await searchHotels(search, new AbortController().signal);
    expect(result).toEqual({ kind: 'empty', searchId: 'hotel-search-2' });
  });

  test('parses a known error response', async () => {
    mockFetch(502, {
      status: 'error',
      code: 'SUPPLIERS_UNAVAILABLE',
      message: 'unavailable',
      searchId: 'hotel-search-3',
    });
    const result = await searchHotels(search, new AbortController().signal);
    expect(result).toEqual({
      kind: 'error',
      code: 'SUPPLIERS_UNAVAILABLE',
      searchId: 'hotel-search-3',
    });
  });

  test.each([
    [200, 'unexpected 200 status payload'],
    [200, { status: 'nonsense', searchId: 'x' }],
    [
      200,
      { status: 'success', searchId: 'x', bestOffer: null, partial: false },
    ],
    [200, { status: 'success', searchId: 'x', partial: false }],
  ])('rejects malformed bodies defensively (%s, %j)', async (_status, body) => {
    mockFetch(200, body);
    await expect(
      searchHotels(search, new AbortController().signal),
    ).rejects.toBeInstanceOf(ApiResponseError);
  });

  test('rejects unknown error codes', async () => {
    mockFetch(500, { status: 'error', code: 'NOT_A_CODE' });
    await expect(
      searchHotels(search, new AbortController().signal),
    ).rejects.toBeInstanceOf(ApiResponseError);
  });

  test('handles unparseable JSON as a contract violation', async () => {
    mockFetch(200, undefined, { invalidJson: true });
    await expect(
      searchHotels(search, new AbortController().signal),
    ).rejects.toBeInstanceOf(ApiResponseError);
  });

  test('posts JSON with the content-type header and the abort signal', async () => {
    const fetchMock = mockFetch(200, {
      status: 'empty',
      message: 'No hotels found',
      searchId: 'x',
    });
    const signal = new AbortController().signal;
    await searchHotels(search, signal);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: string; signal: AbortSignal },
    ];
    expect(url).toBe('/api/search-hotels');
    expect(options.headers['content-type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual(search);
    expect(options.signal).toBe(signal);
  });
});
