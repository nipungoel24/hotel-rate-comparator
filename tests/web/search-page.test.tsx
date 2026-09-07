import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../apps/web/src/App';
import { searchHotels } from '@/lib/api';
import type { ApiSearchResult } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  searchHotels: jest.fn(),
}));

const searchHotelsMock = searchHotels as jest.MockedFunction<
  typeof searchHotels
>;

interface Deferred {
  promise: Promise<ApiSearchResult>;
  resolve: (value: ApiSearchResult) => void;
  reject: (error: unknown) => void;
}
function deferred(): Deferred {
  let resolve!: (value: ApiSearchResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ApiSearchResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function deferredSearch() {
  const gate = deferred();
  searchHotelsMock.mockReturnValueOnce(gate.promise);
  return gate;
}

const sydneySuccess: ApiSearchResult = {
  kind: 'success',
  searchId: 'hotel-search-sydney',
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
};

function validSearchArgs() {
  expect(searchHotelsMock).toHaveBeenCalled();
  const [request, signal] = searchHotelsMock.mock.calls[0] as [
    unknown,
    AbortSignal,
  ];
  return { request, signal };
}

async function fillValidForm(city = 'Sydney') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('City'), city);
  fireEvent.change(screen.getByLabelText('Check-in'), {
    target: { value: '2030-10-12' },
  });
  fireEvent.change(screen.getByLabelText('Check-out'), {
    target: { value: '2030-10-15' },
  });
  return user;
}

beforeEach(() => {
  searchHotelsMock.mockReset();
});

describe('hotel search page', () => {
  test('F01 initial state shows the form and no result region', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', {
        name: 'Find the best available hotel rate.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.getByLabelText('Check-in')).toBeInTheDocument();
    expect(screen.getByLabelText('Check-out')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /search rates/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No hotels found')).not.toBeInTheDocument();
    expect(searchHotelsMock).not.toHaveBeenCalled();
  });

  test('F02 empty city is rejected without an API call', async () => {
    const user = userEvent.setup();
    render(<App />);
    fireEvent.change(screen.getByLabelText('Check-in'), {
      target: { value: '2030-10-12' },
    });
    fireEvent.change(screen.getByLabelText('Check-out'), {
      target: { value: '2030-10-15' },
    });
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(
      screen.getByText('Enter a city name between 2 and 100 characters.'),
    ).toBeInTheDocument();
    expect(searchHotelsMock).not.toHaveBeenCalled();
    const input = screen.getByLabelText('City');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'city-error');
  });

  test('F03 check-out not after check-in is rejected without an API call', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('City'), 'Sydney');
    fireEvent.change(screen.getByLabelText('Check-in'), {
      target: { value: '2030-10-12' },
    });
    fireEvent.change(screen.getByLabelText('Check-out'), {
      target: { value: '2030-10-12' },
    });
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(
      screen.getByText('Check-out must be after check-in.'),
    ).toBeInTheDocument();
    expect(searchHotelsMock).not.toHaveBeenCalled();
  });

  test('F04 past check-in is rejected without an API call', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('City'), 'Sydney');
    fireEvent.change(screen.getByLabelText('Check-in'), {
      target: { value: '2000-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Check-out'), {
      target: { value: '2030-10-15' },
    });
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(
      screen.getByText('Check-in cannot be before today.'),
    ).toBeInTheDocument();
    expect(searchHotelsMock).not.toHaveBeenCalled();
  });

  test('F05 valid submit shows loading state and sends one trimmed request', async () => {
    const gate = deferredSearch();
    render(<App />);
    const user = await fillValidForm('  Sydney  ');
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(screen.getByText('Comparing hotel rates…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cancel search/i }),
    ).toBeInTheDocument();
    expect(searchHotelsMock).toHaveBeenCalledTimes(1);
    const { request } = validSearchArgs();
    expect(request).toEqual({
      city: 'Sydney',
      checkIn: '2030-10-12',
      checkOut: '2030-10-15',
    });
    gate.resolve(sydneySuccess);
    await screen.findByText('Circular Quay Hotel');
  });

  test('F06 complete success renders hotel, price, supplier and completeness', async () => {
    deferredSearch().resolve(sydneySuccess);
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(await screen.findByText('Circular Quay Hotel')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    expect(screen.getByText(/Supplier A/)).toBeInTheDocument();
    expect(screen.getByText('All suppliers checked.')).toBeInTheDocument();
    expect(screen.getByText('Best available rate')).toBeInTheDocument();
    const { signal } = validSearchArgs();
    expect(signal.aborted).toBe(false);
  });

  test('F07 partial success shows the offer with a gentle warning, not a fatal error', async () => {
    deferredSearch().resolve({
      ...sydneySuccess,
      partial: true,
    });
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(await screen.findByText('Circular Quay Hotel')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Best available rate — one supplier could not be checked.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('F08 no hotels shows the empty state with guidance', async () => {
    deferredSearch().resolve({ kind: 'empty', searchId: 's' });
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(await screen.findByText('No hotels found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Try a different city or change your dates, then search again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each([
    [
      'SUPPLIERS_UNAVAILABLE',
      "We couldn't retrieve hotel rates. Please try again.",
    ],
    ['SEARCH_TIMEOUT', 'The search took too long. Please try again.'],
    ['SEARCH_SERVICE_UNAVAILABLE', 'Hotel search is temporarily unavailable.'],
    ['INTERNAL_ERROR', 'Something went wrong. Please try again.'],
  ] as const)('F09-F12 %s shows recoverable copy', async (code, copy) => {
    deferredSearch().resolve({ kind: 'error', code, searchId: 'ref-1' });
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
    // form values are retained for editing
    expect(screen.getByLabelText('City')).toHaveValue('Sydney');
  });

  test('F12 internal errors never leak stack traces or raw JSON', async () => {
    deferredSearch().resolve({ kind: 'error', code: 'INTERNAL_ERROR' });
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    await screen.findByText('Something went wrong. Please try again.');
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/at |node_modules|stack/i);
  });

  test('F13 cancel aborts the request, keeps values and allows a new search', async () => {
    deferredSearch();
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    const { signal } = validSearchArgs();
    await user.click(screen.getByRole('button', { name: /cancel search/i }));
    expect(await screen.findByText('Search cancelled.')).toBeInTheDocument();
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('City')).toHaveValue('Sydney');
    expect(
      screen.getByRole('button', { name: /search rates/i }),
    ).toBeInTheDocument();
  });

  test('F14 a stale response cannot overwrite a newer search', async () => {
    const first = deferred();
    const second = deferred();
    searchHotelsMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<App />);
    const user = await fillValidForm('Sydney');
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    // the first search is cancelled before the second starts
    await user.click(screen.getByRole('button', { name: /cancel search/i }));
    await screen.findByText('Search cancelled.');
    await user.clear(screen.getByLabelText('City'));
    await user.type(screen.getByLabelText('City'), 'Melbourne');
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    expect(searchHotelsMock).toHaveBeenCalledTimes(2);
    const [, firstSignal] = searchHotelsMock.mock.calls[0] as [
      unknown,
      AbortSignal,
    ];
    const [, secondSignal] = searchHotelsMock.mock.calls[1] as [
      unknown,
      AbortSignal,
    ];
    expect(firstSignal.aborted).toBe(true);

    second.resolve({
      ...sydneySuccess,
      bestOffer: {
        ...sydneySuccess.bestOffer,
        hotelId: 'MEL-B-201',
        name: 'Laneway Boutique',
        supplier: 'B',
        priceMinor: 16000,
        price: 160,
      },
    });
    await screen.findByText('Laneway Boutique');
    // the abandoned first search resolves afterwards and must be ignored
    first.resolve(sydneySuccess);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('Laneway Boutique')).toBeInTheDocument();
    expect(screen.queryByText('Circular Quay Hotel')).not.toBeInTheDocument();
    expect(secondSignal.aborted).toBe(false);
  });

  test('F16 pressing Enter while searching does not fire a duplicate request', async () => {
    const gate = deferredSearch();
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    const city = screen.getByLabelText('City');
    await user.click(city);
    await user.keyboard('{Enter}');
    expect(searchHotelsMock).toHaveBeenCalledTimes(1);
    gate.resolve(sydneySuccess);
    await screen.findByText('Circular Quay Hotel');
  });

  test('F17 keyboard tab order covers every field and the action', async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByLabelText('City')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Check-in')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Check-out')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /search rates/i })).toHaveFocus();
  });

  test('empty state keeps the region free of alerts and retry buttons', async () => {
    deferredSearch().resolve({ kind: 'empty', searchId: 's' });
    render(<App />);
    const user = await fillValidForm();
    await user.click(screen.getByRole('button', { name: /search rates/i }));
    await screen.findByText('No hotels found');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
