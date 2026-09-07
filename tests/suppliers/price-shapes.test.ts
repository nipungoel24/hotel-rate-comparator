import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../apps/suppliers/src/app';
import { parseSupplierResponse } from '@hotel/contracts/hotels';
import { aggregateSearch, toSupplierOutcome } from '@hotel/domain';
import type { SearchOutcome, SupplierId, SupplierOutcome } from '@hotel/domain';

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

async function outcomeFor(
  supplier: SupplierId,
  city: string,
): Promise<SupplierOutcome> {
  const response = await request(server)
    .get(`/supplier${supplier}/hotels`)
    .query({ city, checkIn: '2026-10-12', checkOut: '2026-10-15' });
  expect(response.status).toBe(200);
  const parsed = parseSupplierResponse(response.body);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error('unreachable: response should parse');
  return toSupplierOutcome(supplier, parsed.value);
}

async function search(city: string): Promise<SearchOutcome> {
  const [a, b] = await Promise.all([
    outcomeFor('A', city),
    outcomeFor('B', city),
  ]);
  return aggregateSearch(a, b);
}

describe('price shapes served by the mock inventories', () => {
  test('sydney: Supplier A is cheaper (S01)', async () => {
    const result = await search('sydney');
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best.supplier).toBe('A');
      expect(result.best.hotelId).toBe('SYD-A-101');
      expect(result.best.priceMinor).toBe(12000);
      expect(result.partial).toBe(false);
    }
  });

  test('melbourne: Supplier B is cheaper (S02)', async () => {
    const result = await search('melbourne');
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best.supplier).toBe('B');
      expect(result.best.hotelId).toBe('MEL-B-201');
      expect(result.best.priceMinor).toBe(16000);
    }
  });

  test('brisbane: equal cheapest price and Supplier A wins the tie (S03)', async () => {
    const result = await search('brisbane');
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best.supplier).toBe('A');
      expect(result.best.priceMinor).toBe(9995);
      expect(result.best.hotelId).toBe('BNE-A-101');
    }
  });

  test('perth: global minimum across two unsorted multi-hotel lists (S13)', async () => {
    const result = await search('perth');
    expect(result.kind).toBe('result');
    if (result.kind === 'result') {
      expect(result.best.hotelId).toBe('PER-B-203');
      expect(result.best.priceMinor).toBe(15490);
    }
  });

  test('unknown city: both suppliers return successful empty lists (S06 direction)', async () => {
    const result = await search('Adelaide');
    expect(result.kind).toBe('no_hotels');
  });
});
