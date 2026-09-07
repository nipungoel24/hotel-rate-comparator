import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../apps/suppliers/src/app';
import {
  ATTEMPT_HEADER,
  SCENARIO_HEADER,
} from '../../apps/suppliers/src/scenarios';

const app = createApp();
let server: Server;

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

const query = { city: 'sydney', checkIn: '2026-10-12', checkOut: '2026-10-15' };

describe('simultaneous search isolation', () => {
  test('a delayed A request and a failing B request are independent', async () => {
    const started = Date.now();
    const [aResponse, bResponse] = await Promise.all([
      request(server)
        .get('/supplierA/hotels')
        .query(query)
        .set(SCENARIO_HEADER, 'delay'),
      request(server)
        .get('/supplierB/hotels')
        .query(query)
        .set(SCENARIO_HEADER, 'server-error'),
    ]);
    expect(aResponse.status).toBe(200);
    expect(bResponse.status).toBe(500);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2400);
  }, 15000);

  test('interleaved fail-twice sequences keep per-request attempt state', async () => {
    const results: number[] = [];
    const attempt = async (supplier: string, number: string) => {
      const response = await request(server)
        .get(`/supplier${supplier}/hotels`)
        .query(query)
        .set(SCENARIO_HEADER, 'fail-twice')
        .set(ATTEMPT_HEADER, number);
      results.push(response.status);
    };
    await attempt('A', '1');
    await attempt('B', '1');
    await attempt('A', '2');
    await attempt('B', '2');
    await attempt('A', '3');
    await attempt('B', '3');
    expect(results).toEqual([500, 500, 500, 500, 200, 200]);
  });

  test('repeated empty responses do not accumulate state', async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await request(server)
        .get('/supplierA/hotels')
        .query(query)
        .set(SCENARIO_HEADER, 'empty');
      expect(response.status).toBe(200);
      expect(response.body.hotels).toEqual([]);
    }
  });

  test('normal responses for both suppliers stay fast with fixed default delays', async () => {
    const started = Date.now();
    const [aResponse, bResponse] = await Promise.all([
      request(server).get('/supplierA/hotels').query(query),
      request(server).get('/supplierB/hotels').query(query),
    ]);
    expect(aResponse.status).toBe(200);
    expect(bResponse.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('server remains healthy after aborted very-slow and hang requests', async () => {
    const verySlow = request(server)
      .get('/supplierA/hotels')
      .query(query)
      .set(SCENARIO_HEADER, 'very-slow');
    void verySlow.catch(() => {});
    const hang = request(server)
      .get('/supplierB/hotels')
      .query(query)
      .set(SCENARIO_HEADER, 'hang');
    void hang.catch(() => {});
    await delay(300);
    verySlow.abort();
    hang.abort();
    await delay(300);
    const health = await request(server).get('/health');
    expect(health.status).toBe(200);
  }, 10000);
});

describe('scenario controls can be disabled', () => {
  const lockedApp = createApp({ scenarioControlsDisabled: true });
  let lockedServer: Server;

  beforeAll(async () => {
    lockedServer = lockedApp.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) =>
      lockedServer.once('listening', () => resolve()),
    );
  });

  afterAll(async () => {
    lockedServer.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      lockedServer.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  });

  test('scenario headers are ignored when controls are disabled', async () => {
    const response = await request(lockedServer)
      .get('/supplierA/hotels')
      .query(query)
      .set(SCENARIO_HEADER, 'server-error');
    expect(response.status).toBe(200);
    expect(response.body.hotels.length).toBeGreaterThan(0);
  });
});
