import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loginAdmin, loginAuthor1, startTestApp, type TestContext } from './helpers/test-app';
import { PASSWORDS } from './helpers/fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => ctx.stop());

describe('authentication', () => {
  it('logs in an author with a session cookie and CSRF token', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'ASHA.VERMA@example.test', password: PASSWORDS.author });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      role: 'AUTHOR',
      authorCode: 'TAUTH01',
      name: 'Asha Verma',
    });
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('bl_session=');
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'asha.verma@example.test', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same response (no user enumeration)', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates the login payload (422 with field details)', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('returns 401 for protected routes without a session', async () => {
    const res = await request(ctx.app).get('/api/v1/authors/me/books');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.requestId).toEqual(expect.any(String));
  });

  it('returns the session from /auth/me', async () => {
    const session = await loginAdmin(ctx.app);
    const res = await session.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('ADMIN');
    expect(res.body.data.csrfToken).toBe(session.csrf);
  });

  it('requires the CSRF token on state-changing requests', async () => {
    const session = await loginAuthor1(ctx.app);
    const res = await session.agent.post('/api/v1/tickets').send({
      bookId: null,
      subject: 'Missing token test',
      description: 'This request has no CSRF token at all.',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('rejects non-JSON mutation bodies (blocks cross-site form posts)', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .type('form')
      .send('email=a@b.c&password=x');
    expect(res.status).toBe(415);
  });

  it('logs out by clearing the cookie', async () => {
    const session = await loginAuthor1(ctx.app);
    const res = await session.post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/bl_session=;/);
  });
});
