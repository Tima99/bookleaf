import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  loginAdmin,
  loginAuthor1,
  loginAuthor2,
  startTestApp,
  type TestContext,
} from './helpers/test-app';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => ctx.stop());

describe('author data access', () => {
  it('lists only the signed-in author’s books', async () => {
    const s = await loginAuthor1(ctx.app);
    const res = await s.get('/api/v1/authors/me/books');
    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { bookCode: string }) => b.bookCode).sort()).toEqual([
      'TBK01',
      'TBK02',
    ]);
    expect(res.body.meta).toMatchObject({ page: 1, total: 2 });
  });

  it('preserves null fields for books in production', async () => {
    const s = await loginAuthor1(ctx.app);
    const res = await s.get('/api/v1/authors/me/books/TBK02');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      stage: 'IN_PRODUCTION',
      productionStage: 'Cover Design',
      publicationDate: null,
      mrp: null,
      authorRoyaltyPerCopy: null,
      printPartner: null,
      lastRoyaltyPayoutDate: null,
      totalCopiesSold: 0,
      availableOn: [],
    });
  });

  it('filters books by stage', async () => {
    const s = await loginAuthor1(ctx.app);
    const res = await s.get('/api/v1/authors/me/books?stage=PUBLISHED');
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 404 (not 403) for another author’s book', async () => {
    const s = await loginAuthor2(ctx.app);
    const res = await s.get('/api/v1/authors/me/books/TBK01');
    expect(res.status).toBe(404);
  });

  it('computes dashboard totals from stored data, including zero payouts', async () => {
    const s = await loginAuthor2(ctx.app);
    const res = await s.get('/api/v1/authors/me/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({
      totalBooks: 1,
      publishedBooks: 1,
      inProductionBooks: 0,
      totalRoyaltyEarned: 500,
      royaltyPaid: 0,
      royaltyPending: 500,
    });
    // ₹500 pending is below the ₹1,000 payout threshold.
    expect(res.body.data.royaltyCalendar.pendingBelowThreshold).toBe(true);
  });

  it('blocks authors from admin endpoints and admins from author endpoints', async () => {
    const author = await loginAuthor1(ctx.app);
    expect((await author.get('/api/v1/admin/tickets')).status).toBe(403);
    expect((await author.get('/api/v1/admin/ai/strategies')).status).toBe(403);
    const admin = await loginAdmin(ctx.app);
    expect((await admin.get('/api/v1/authors/me/books')).status).toBe(403);
  });

  it('rejects malformed ids with 400', async () => {
    const admin = await loginAdmin(ctx.app);
    const res = await admin.get('/api/v1/admin/tickets/not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('health', () => {
  it('greets visitors on the home route with useful links', async () => {
    const res = await request(ctx.app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'BookLeaf Author Support API',
      links: { health: '/health', api: '/api/v1' },
    });
    expect((await request(ctx.app).get('/api/docs')).status).toBe(404);
  });

  it('reports uptime and the MongoDB connection in one public route', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      database: { connected: true, state: 'connected' },
    });
    expect(res.body.uptimeSeconds).toBeTypeOf('number');
    expect(
      await request(ctx.app)
        .get('/health/ready')
        .then((r) => r.status),
    ).toBe(404);
  });
});

describe('CORS', () => {
  const origin = 'http://localhost:3000';

  it('allows the configured web origin', async () => {
    const res = await request(ctx.app).get('/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it('leaves CORS to the gateway when CORS_HANDLED_BY_PROXY is set', async () => {
    const app = createApp({
      ...ctx.container,
      config: { ...ctx.container.config, corsHandledByProxy: true },
    });
    const res = await request(app).get('/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
