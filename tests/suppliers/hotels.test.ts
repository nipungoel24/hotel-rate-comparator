import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, test } from '@jest/globals';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import { createApp } from '../../apps/suppliers/src/app';
import {
  ATTEMPT_HEADER,
  SCENARIO_HEADER,
} from '../../apps/suppliers/src/scenarios';
import { parseSupplierResponse } from '@hotel/contracts/hotels';

const app = createApp();
let server: Server;

function path(supplier: string): string {
  return `/supplier${supplier}/hotels`;
}

function query() {
  return { city: 'sydney', checkIn: '2026-10-12', checkOut: '2026-10-15' };
}

function setScenario(
  supplierResponse: request.Test,
  scenario: string,
): request.Test {
  return supplierResponse.set(SCENARIO_HEADER, scenario);
}

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) =>
    server.once('listening', () => resolve()),
  );
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    }),
  );
});

describe('supplier endpoints', () => {
  test.each([['A'], ['B']])('%s responds to /health', async (supplier) => {
    void supplier;
    const response = await request(server).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'suppliers' });
  });

  test.each([['A'], ['B']])(
    '%s normal success returns typed inventory',
    async (supplier) => {
      const response = await request(server).get(path(supplier)).query(query());
      expect(response.status).toBe(200);
      expect(response.body.currency).toBe('AUD');
      expect(response.body.priceBasis).toBe('total_stay');
      expect(Array.isArray(response.body.hotels)).toBe(true);
      expect(response.body.hotels.length).toBeGreaterThan(0);
      for (const hotel of response.body.hotels) {
        expect(typeof hotel.hotelId).toBe('string');
        expect(hotel.hotelId.length).toBeGreaterThan(0);
        expect(typeof hotel.name).toBe('string');
        expect(hotel.name.length).toBeGreaterThan(0);
        expect(typeof hotel.price).toBe('number');
      }
      expect(parseSupplierResponse(response.body).ok).toBe(true);
    },
  );

  test.each([['A'], ['B']])(
    '%s returns a successful empty inventory for an unknown city',
    async (supplier) => {
      const response = await request(server)
        .get(path(supplier))
        .query({ ...query(), city: 'Adelaide' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        hotels: [],
        currency: 'AUD',
        priceBasis: 'total_stay',
      });
    },
  );

  test.each([['A'], ['B']])(
    '%s empty scenario returns a successful empty list',
    async (supplier) => {
      const response = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'empty',
      );
      expect(response.status).toBe(200);
      expect(response.body.hotels).toEqual([]);
    },
  );

  test.each([['A'], ['B']])(
    '%s server-error scenario returns 500',
    async (supplier) => {
      const response = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'server-error',
      );
      expect(response.status).toBe(500);
    },
  );

  test.each([['A'], ['B']])(
    '%s delay scenario responds successfully after a controlled delay',
    async (supplier) => {
      const started = Date.now();
      const response = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'delay',
      );
      expect(response.status).toBe(200);
      expect(Date.now() - started).toBeGreaterThanOrEqual(2400);
    },
    15000,
  );

  test.each([['A'], ['B']])(
    '%s very-slow scenario stays silent past the 5-second branch budget',
    async (supplier) => {
      let settled = false;
      const pending = setScenario(
        request(server).get(path(supplier)).query(query()),
        'very-slow',
      );
      void pending
        .then(() => {
          settled = true;
        })
        .catch(() => {
          settled = true;
        });
      await delay(3000);
      expect(settled).toBe(false);
      pending.abort();
      await delay(200);
      const health = await request(server).get('/health');
      expect(health.status).toBe(200);
    },
    15000,
  );

  test.each([['A'], ['B']])(
    '%s fail-twice: 500, 500, then success on attempt 3',
    async (supplier) => {
      const first = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'fail-twice',
      ).set(ATTEMPT_HEADER, '1');
      const second = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'fail-twice',
      ).set(ATTEMPT_HEADER, '2');
      const third = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'fail-twice',
      ).set(ATTEMPT_HEADER, '3');
      expect(first.status).toBe(500);
      expect(second.status).toBe(500);
      expect(third.status).toBe(200);
    },
  );

  test.each([['A'], ['B']])(
    '%s fail-twice defaults to attempt 1 (500)',
    async (supplier) => {
      const response = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'fail-twice',
      );
      expect(response.status).toBe(500);
    },
  );

  test.each([['A'], ['B']])(
    '%s hang scenario never responds and cleans up on disconnect',
    async (supplier) => {
      let settled = false;
      const pending = setScenario(
        request(server).get(path(supplier)).query(query()),
        'hang',
      );
      void pending
        .then(() => {
          settled = true;
        })
        .catch(() => {
          settled = true;
        });
      await delay(800);
      expect(settled).toBe(false);
      pending.abort();
      await delay(200);
      const health = await request(server).get('/health');
      expect(health.status).toBe(200);
    },
  );

  test.each([['A'], ['B']])(
    '%s invalid-payload scenario returns data that fails the contract schema',
    async (supplier) => {
      const response = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'invalid-payload',
      );
      expect(response.status).toBe(200);
      expect(parseSupplierResponse(response.body).ok).toBe(false);
    },
  );

  test.each([['A'], ['B']])(
    '%s rejects an unknown scenario header',
    async (supplier) => {
      const response = await setScenario(
        request(server).get(path(supplier)).query(query()),
        'not-a-scenario',
      );
      expect(response.status).toBe(400);
    },
  );

  test.each([['A'], ['B']])(
    '%s rejects an invalid attempt header',
    async (supplier) => {
      for (const attempt of ['0', '-1', 'abc']) {
        const response = await setScenario(
          request(server).get(path(supplier)).query(query()),
          'fail-twice',
        ).set(ATTEMPT_HEADER, attempt);
        expect(response.status).toBe(400);
      }
    },
  );
});

describe('supplier query validation', () => {
  const valid = {
    city: 'Sydney',
    checkIn: '2026-10-12',
    checkOut: '2026-10-15',
  };

  test.each([['A'], ['B']])('%s rejects a missing city', async (supplier) => {
    const response = await request(server)
      .get(path(supplier))
      .query({ checkIn: valid.checkIn, checkOut: valid.checkOut });
    expect(response.status).toBe(400);
  });

  test.each([['A'], ['B']])('%s rejects an invalid city', async (supplier) => {
    const response = await request(server)
      .get(path(supplier))
      .query({ ...valid, city: 'A' });
    expect(response.status).toBe(400);
  });

  test.each([['A'], ['B']])(
    '%s rejects an impossible check-in date',
    async (supplier) => {
      const response = await request(server)
        .get(path(supplier))
        .query({ ...valid, checkIn: '2026-02-30' });
      expect(response.status).toBe(400);
    },
  );

  test.each([['A'], ['B']])(
    '%s rejects check-out before check-in',
    async (supplier) => {
      const response = await request(server)
        .get(path(supplier))
        .query({ ...valid, checkOut: '2026-10-10' });
      expect(response.status).toBe(400);
    },
  );

  test.each([['A'], ['B']])(
    '%s rejects repeated query parameters',
    async (supplier) => {
      const response = await request(server).get(
        `${path(supplier)}?city=Sydney&city=Melbourne&checkIn=${valid.checkIn}&checkOut=${valid.checkOut}`,
      );
      expect(response.status).toBe(400);
    },
  );
});

describe('supplier response sanity across suites', () => {
  test('A and B normal responses both satisfy the shared contract', async () => {
    const responses: SupertestResponse[] = [
      await request(server).get(path('A')).query(query()),
      await request(server).get(path('B')).query(query()),
    ];
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(parseSupplierResponse(response.body).ok).toBe(true);
    }
  });
});
