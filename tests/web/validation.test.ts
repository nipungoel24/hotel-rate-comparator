import {
  calendarDayDiff,
  isRealCalendarDate,
  nextDayIso,
  utcToday,
  validateSearchFields,
} from '../../apps/web/src/features/search/validation';

describe('client calendar/date helpers', () => {
  test('utcToday returns the UTC calendar date shape', () => {
    expect(utcToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('isRealCalendarDate rejects impossible dates', () => {
    expect(isRealCalendarDate('2030-10-12')).toBe(true);
    expect(isRealCalendarDate('2030-02-29')).toBe(false);
    expect(isRealCalendarDate('2030-13-01')).toBe(false);
    expect(isRealCalendarDate('2030-00-10')).toBe(false);
  });

  test('nextDayIso advances the calendar day without timezone shifts', () => {
    expect(nextDayIso('2030-10-12')).toBe('2030-10-13');
    expect(nextDayIso('2030-12-31')).toBe('2031-01-01');
    expect(nextDayIso('2028-02-28')).toBe('2028-02-29');
  });

  test('calendarDayDiff counts nights between dates', () => {
    expect(calendarDayDiff('2030-10-12', '2030-10-15')).toBe(3);
    expect(calendarDayDiff('2030-12-30', '2031-01-02')).toBe(3);
  });
});

describe('validateSearchFields mirrors the server rules', () => {
  const today = '2030-10-01';
  const valid = {
    city: 'Sydney',
    checkIn: '2030-10-12',
    checkOut: '2030-10-15',
  };

  test('accepts a valid request and trims the city', () => {
    const result = validateSearchFields(
      '  Sydney  ',
      valid.checkIn,
      valid.checkOut,
      today,
    );
    expect(result).toEqual({
      ok: true,
      request: {
        city: 'Sydney',
        checkIn: '2030-10-12',
        checkOut: '2030-10-15',
      },
    });
  });

  test.each([
    ['', 'city'],
    ['  ', 'city'],
    ['S', 'city'],
  ])('rejects invalid city %j', (city, field) => {
    const result = validateSearchFields(
      city,
      valid.checkIn,
      valid.checkOut,
      today,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[field as 'city']).toBeDefined();
  });

  test('rejects past check-in', () => {
    const result = validateSearchFields(
      'Sydney',
      '2029-12-31',
      '2030-01-05',
      today,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.checkIn).toBeDefined();
  });

  test('rejects check-out equal to or before check-in', () => {
    const equal = validateSearchFields(
      'Sydney',
      '2030-10-12',
      '2030-10-12',
      today,
    );
    expect(equal.ok).toBe(false);
    if (!equal.ok) expect(equal.errors.checkOut).toBeDefined();
    const before = validateSearchFields(
      'Sydney',
      '2030-10-12',
      '2030-10-11',
      today,
    );
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.errors.checkOut).toBeDefined();
  });

  test('rejects malformed dates', () => {
    const result = validateSearchFields(
      'Sydney',
      'not-a-date',
      '2030-10-15',
      today,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.checkIn).toBeDefined();
  });
});
