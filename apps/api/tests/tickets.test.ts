import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TicketModel } from '../src/database/models';
import {
  loginAdmin,
  loginAuthor1,
  loginAuthor2,
  startTestApp,
  type Session,
  type TestContext,
} from './helpers/test-app';

let ctx: TestContext;
let author: Session;
let author2: Session;
let admin: Session;

beforeAll(async () => {
  ctx = await startTestApp();
  author = await loginAuthor1(ctx.app);
  author2 = await loginAuthor2(ctx.app);
  admin = await loginAdmin(ctx.app);
});
afterAll(async () => ctx.stop());
beforeEach(() => {
  ctx.llm.mode = 'ok';
  ctx.llm.calls = [];
});

let counter = 0;
async function createTicket(
  session: Session,
  overrides: Partial<{ bookId: string | null; subject: string; description: string }> = {},
) {
  counter += 1;
  const res = await session.post('/api/v1/tickets', {
    bookId: 'TBK01',
    subject: `Royalty question number ${counter}`,
    description: `I have not received my royalty payment for this quarter yet (case ${counter}).`,
    ...overrides,
  });
  await ctx.container.jobs.drain(); // wait for async AI triage
  return res;
}

describe('ticket creation and AI triage', () => {
  it('creates a ticket and classifies it with the model', async () => {
    const res = await createTicket(author);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'OPEN', book: { bookCode: 'TBK01' } });
    expect(res.body.data.reference).toMatch(/^BL-\d+$/);

    const stored = await TicketModel.findById(res.body.data.id).lean();
    expect(stored?.triage.status).toBe('COMPLETED');
    expect(stored?.triage.source).toBe('AI');
    expect(stored?.category).toBe('ROYALTY_PAYMENTS');
    expect(stored?.categorySource).toBe('AI');
    expect(stored?.triage.strategyVersions.length).toBeGreaterThan(0);
    expect(ctx.llm.callsFor('triage')).toHaveLength(1);
  });

  it('still creates the ticket when the AI provider fails, using rule-based triage', async () => {
    ctx.llm.mode = 'rate_limited';
    const res = await createTicket(author, {
      subject: 'Amazon shows the wrong ISBN for my book',
      description: 'The ISBN on Amazon is different from the ISBN printed on my copies.',
    });
    expect(res.status).toBe(201);
    const stored = await TicketModel.findById(res.body.data.id).lean();
    expect(stored?.triage.status).toBe('FAILED');
    expect(stored?.triage.failureKind).toBe('RATE_LIMITED');
    expect(stored?.triage.source).toBe('RULES');
    expect(stored?.category).toBe('ISBN_METADATA');
    // KB policy: ISBN errors are always at least HIGH.
    expect(stored?.priority).toBe('HIGH');
    expect(stored?.categorySource).toBe('RULES');
  });

  it('marks triage as SKIPPED (not failed) when AI is not configured', async () => {
    ctx.llm.mode = 'not_configured';
    const res = await createTicket(author, {
      bookId: null,
      subject: 'Can I update my author bio?',
      description: 'I would like to update my author bio on the store page please.',
    });
    expect(res.status).toBe(201);
    const stored = await TicketModel.findById(res.body.data.id).lean();
    expect(stored?.triage.status).toBe('SKIPPED');
    expect(stored?.priority).toBe('LOW');
  });

  it('raises the model priority with deterministic floor rules', async () => {
    ctx.llm.triage = { ...ctx.llm.triage, category: 'ISBN_METADATA', priority: 'LOW' };
    const res = await createTicket(author, {
      subject: 'Duplicate ISBN on my listing',
      description: 'My book has a duplicate ISBN listed on the platform.',
    });
    const stored = await TicketModel.findById(res.body.data.id).lean();
    expect(stored?.priority).toBe('HIGH');
    expect(stored?.triage.rulesApplied.length).toBeGreaterThan(0);
    ctx.llm.triage = { ...ctx.llm.triage, category: 'ROYALTY_PAYMENTS', priority: 'MEDIUM' };
  });

  it('treats unusable model output as INVALID_OUTPUT and falls back to rules', async () => {
    const good = ctx.llm.triage;
    ctx.llm.triage = { ...good, rationale: '' }; // passes the model schema, fails validation
    const res = await createTicket(author, {
      subject: 'Royalty statement looks wrong',
      description: 'My royalty statement for last quarter looks wrong to me.',
    });
    const stored = await TicketModel.findById(res.body.data.id).lean();
    expect(stored?.triage.status).toBe('FAILED');
    expect(stored?.triage.failureKind).toBe('INVALID_OUTPUT');
    expect(stored?.triage.source).toBe('RULES');
    ctx.llm.triage = good;
  });

  it('rejects a book that belongs to another author', async () => {
    const res = await author2.post('/api/v1/tickets', {
      bookId: 'TBK01',
      subject: 'Not my book at all',
      description: 'Trying to open a ticket on a book that is not mine.',
    });
    expect(res.status).toBe(422);
  });

  it('validates input with meaningful messages', async () => {
    const res = await author.post('/api/v1/tickets', {
      bookId: null,
      subject: 'Hi',
      description: 'short',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['subject', 'description']),
    );
  });

  it('prevents duplicate submissions', async () => {
    const body = {
      bookId: null,
      subject: 'Exact duplicate subject',
      description: 'Exactly the same description submitted twice in a row.',
    };
    expect((await author.post('/api/v1/tickets', body)).status).toBe(201);
    const second = await author.post('/api/v1/tickets', body);
    expect(second.status).toBe(409);
    await ctx.container.jobs.drain();
  });
});

describe('author ticket visibility', () => {
  it('lists only the author’s own tickets and hides others (404)', async () => {
    const mine = await createTicket(author2, {
      bookId: 'TBK03',
      subject: 'Dev ticket subject',
      description: 'A ticket created by the second author for isolation.',
    });
    const list = await author.get('/api/v1/tickets/mine');
    expect(list.body.data.every((t: { id: string }) => t.id !== mine.body.data.id)).toBe(true);
    const cross = await author.get(`/api/v1/tickets/mine/${mine.body.data.id}`);
    expect(cross.status).toBe(404);
  });

  it('filters by status and searches by reference', async () => {
    const created = await createTicket(author);
    const ref: string = created.body.data.reference;
    const res = await author.get(`/api/v1/tickets/mine?status=OPEN&search=${ref}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].reference).toBe(ref);
  });
});

describe('admin workflow', () => {
  it('paginates and filters the queue server-side', async () => {
    const page1 = await admin.get('/api/v1/admin/tickets?pageSize=2&page=1&sort=newest');
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.total).toBeGreaterThan(2);
    const filtered = await admin.get(
      '/api/v1/admin/tickets?category=ISBN_METADATA&priority=HIGH,CRITICAL',
    );
    expect(filtered.body.data.length).toBeGreaterThan(0);
    expect(
      filtered.body.data.every((t: { category: string }) => t.category === 'ISBN_METADATA'),
    ).toBe(true);
    const bad = await admin.get('/api/v1/admin/tickets?status=NOPE');
    expect(bad.status).toBe(400);
  });

  it('keeps admin overrides when AI triage is re-run', async () => {
    const created = await createTicket(author);
    const id = created.body.data.id;
    const patch = await admin.patch(`/api/v1/admin/tickets/${id}`, {
      category: 'GENERAL_INQUIRY',
      priority: 'CRITICAL',
    });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({
      category: 'GENERAL_INQUIRY',
      categorySource: 'ADMIN',
      priority: 'CRITICAL',
      prioritySource: 'ADMIN',
    });

    const retriage = await admin.post(`/api/v1/admin/tickets/${id}/ai/classify`);
    expect(retriage.status).toBe(200);
    expect(retriage.body.data).toMatchObject({
      category: 'GENERAL_INQUIRY',
      priority: 'CRITICAL',
      categorySource: 'ADMIN',
    });
    // The AI's own opinion is still recorded separately.
    expect(retriage.body.data.triage.category).toBe('ROYALTY_PAYMENTS');
    expect(
      retriage.body.data.activity.some((a: { action: string }) => a.action === 'ticket.updated'),
    ).toBe(true);
  });

  it('enforces the status transition rules', async () => {
    const created = await createTicket(author);
    const id = created.body.data.id;
    expect((await admin.patch(`/api/v1/admin/tickets/${id}`, { status: 'CLOSED' })).status).toBe(
      200,
    );
    const invalid = await admin.patch(`/api/v1/admin/tickets/${id}`, { status: 'RESOLVED' });
    expect(invalid.status).toBe(409);
    expect(invalid.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('rejects unknown fields in updates (no mass assignment)', async () => {
    const created = await createTicket(author);
    const res = await admin.patch(`/api/v1/admin/tickets/${created.body.data.id}`, {
      status: 'IN_PROGRESS',
      author: 'x',
    });
    expect(res.status).toBe(422);
  });

  it('assigns a ticket to the current admin', async () => {
    const created = await createTicket(author);
    const res = await admin.post(`/api/v1/admin/tickets/${created.body.data.id}/assign`, {
      assigneeId: admin.userId,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.assignee.id).toBe(admin.userId);
    const mine = await admin.get('/api/v1/admin/tickets?assignee=me');
    expect(mine.body.data.some((t: { id: string }) => t.id === created.body.data.id)).toBe(true);
  });

  it('keeps internal notes private and shows public responses to the author', async () => {
    const created = await createTicket(author);
    const id = created.body.data.id;
    const secret = 'INTERNAL: author has a pending finance dispute';
    expect((await admin.post(`/api/v1/admin/tickets/${id}/notes`, { body: secret })).status).toBe(
      201,
    );

    const draft = await admin.post(`/api/v1/admin/tickets/${id}/ai/draft`, {});
    expect(draft.status).toBe(200);
    expect(draft.body.data.draft.source).toBe('AI');
    const draftId: string = draft.body.data.draft.id;

    const reply = await admin.post(`/api/v1/admin/tickets/${id}/responses`, {
      body: `${draft.body.data.draft.body}\n\nP.S. We have escalated this.`,
      draftId,
    });
    expect(reply.status).toBe(201);
    expect(reply.body.data.status).toBe('IN_PROGRESS');
    expect(reply.body.data.messages.at(-1).origin).toBe('AI_DRAFT_EDITED');
    expect(reply.body.data.internalNotes).toHaveLength(1);

    const authorView = await author.get(`/api/v1/tickets/mine/${id}`);
    expect(authorView.status).toBe(200);
    expect(authorView.body.data.messages).toHaveLength(1);
    expect(authorView.body.data.latestAdminResponse.excerpt).toContain('Dear Asha');
    expect(JSON.stringify(authorView.body)).not.toContain(secret);
    expect(authorView.body.data.internalNotes).toBeUndefined();
  });

  it('serves the cached draft without a new model call', async () => {
    const created = await createTicket(author);
    const id = created.body.data.id;
    await admin.post(`/api/v1/admin/tickets/${id}/ai/draft`, {});
    const before = ctx.llm.callsFor('draft').length;
    const again = await admin.post(`/api/v1/admin/tickets/${id}/ai/draft`, {});
    expect(again.body.data.fromCache).toBe(true);
    expect(ctx.llm.callsFor('draft').length).toBe(before);
    const forced = await admin.post(`/api/v1/admin/tickets/${id}/ai/draft`, { force: true });
    expect(forced.body.data.fromCache).toBe(false);
    expect(ctx.llm.callsFor('draft').length).toBe(before + 1);
  });

  it('falls back to a policy template when drafting fails, and manual replies still work', async () => {
    const created = await createTicket(author);
    const id = created.body.data.id;
    ctx.llm.mode = 'timeout';
    const draft = await admin.post(`/api/v1/admin/tickets/${id}/ai/draft`, {});
    expect(draft.status).toBe(200);
    expect(draft.body.data.failure.kind).toBe('TIMEOUT');
    expect(draft.body.data.draft.source).toBe('TEMPLATE');
    const reply = await admin.post(`/api/v1/admin/tickets/${id}/responses`, {
      body: 'Manual reply written by the team.',
      statusAfter: 'RESOLVED',
    });
    expect(reply.status).toBe(201);
    expect(reply.body.data.status).toBe('RESOLVED');
    expect(reply.body.data.messages.at(-1).origin).toBe('MANUAL');
  });

  it('re-opens a resolved ticket when the author follows up, and blocks replies on closed tickets', async () => {
    const created = await createTicket(author);
    const id = created.body.data.id;
    await admin.post(`/api/v1/admin/tickets/${id}/responses`, {
      body: 'Resolved for you.',
      statusAfter: 'RESOLVED',
    });
    const follow = await author.post(`/api/v1/tickets/mine/${id}/messages`, {
      body: 'Thanks, but one more question.',
    });
    expect(follow.status).toBe(201);
    expect(follow.body.data.status).toBe('IN_PROGRESS');
    await admin.patch(`/api/v1/admin/tickets/${id}`, { status: 'CLOSED' });
    const blocked = await author.post(`/api/v1/tickets/mine/${id}/messages`, {
      body: 'Hello again?',
    });
    expect(blocked.status).toBe(409);
  });

  it('returns dashboard counters from real data', async () => {
    const res = await admin.get('/api/v1/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data.counts.total).toBeGreaterThan(0);
    expect(res.body.data.avgFirstResponseMinutes).not.toBeUndefined();
    expect(Array.isArray(res.body.data.needsAttention)).toBe(true);
  });

  it('lists authors with book and open ticket counts', async () => {
    const res = await admin.get('/api/v1/admin/authors?search=asha');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ authorCode: 'TAUTH01', bookCount: 2 });
    expect(res.body.data[0].openTicketCount).toBeGreaterThan(0);
  });
});
