import { Router, type RequestHandler } from 'express';
import {
  ActivateStrategyVersionRequestSchema,
  AiRunListQuerySchema,
  CreateStrategyRequestSchema,
  IdParamsSchema,
  StrategyListQuerySchema,
  TestStrategyRequestSchema,
  UpdateStrategyRequestSchema,
  type AiStatusDto,
} from '@bookleaf/contracts';
import { created, handle, ok, paginated, requireUser } from '../../common/http';
import { KNOWLEDGE_SECTIONS } from '../knowledge-base/sections';
import { toKnowledgeSectionDto } from '../knowledge-base/retrieval';
import type { LlmClient } from './providers/llm-client';
import type { AiRunService } from './services/ai-run.service';
import type { StrategyTestService } from './services/strategy-test.service';
import type { StrategyService } from './services/strategy.service';

/** `/api/v1/admin/ai/*` — AI configuration, strategies, test console and run log (admin only). */
export function createAiAdminRouter(deps: {
  strategies: StrategyService;
  tester: StrategyTestService;
  runs: AiRunService;
  llm: LlmClient;
  aiRateLimit: RequestHandler;
}) {
  const { strategies, tester, runs, llm } = deps;
  const router = Router();

  router.get(
    '/status',
    handle({}, async () => {
      const usage = await runs.last24h();
      const status: AiStatusDto = {
        configured: llm.isConfigured(),
        provider: llm.provider,
        defaultModels: { triage: llm.defaultModel('triage'), draft: llm.defaultModel('draft') },
        circuitOpenUntil: llm.circuitOpenUntil()?.toISOString() ?? null,
        last24h: usage,
      };
      return ok(status);
    }),
  );

  router.get(
    '/knowledge-base',
    handle({}, async () => ok(KNOWLEDGE_SECTIONS.map(toKnowledgeSectionDto))),
  );

  router.get(
    '/runs',
    handle({ query: AiRunListQuerySchema }, async ({ query }) => {
      const { items, meta } = await runs.list(query);
      return paginated(items, meta);
    }),
  );

  router.get(
    '/strategies',
    handle({ query: StrategyListQuerySchema }, async ({ query }) =>
      ok(await strategies.list(query)),
    ),
  );

  router.post(
    '/strategies',
    handle({ body: CreateStrategyRequestSchema }, async ({ req, body }) =>
      created(await strategies.create(body, requireUser(req))),
    ),
  );

  router.get(
    '/strategies/:id',
    handle({ params: IdParamsSchema }, async ({ params }) => ok(await strategies.get(params.id))),
  );

  router.patch(
    '/strategies/:id',
    handle(
      { params: IdParamsSchema, body: UpdateStrategyRequestSchema },
      async ({ req, params, body }) =>
        ok(await strategies.update(params.id, body, requireUser(req))),
    ),
  );

  router.get(
    '/strategies/:id/versions',
    handle({ params: IdParamsSchema }, async ({ params }) =>
      ok(await strategies.listVersions(params.id)),
    ),
  );

  router.post(
    '/strategies/:id/activate',
    handle(
      { params: IdParamsSchema, body: ActivateStrategyVersionRequestSchema },
      async ({ req, params, body }) =>
        ok(await strategies.activateVersion(params.id, body.version, requireUser(req))),
    ),
  );

  router.post(
    '/strategies/:id/duplicate',
    handle({ params: IdParamsSchema }, async ({ req, params }) =>
      created(await strategies.duplicate(params.id, requireUser(req))),
    ),
  );

  router.post(
    '/strategies/:id/test',
    deps.aiRateLimit,
    handle({ params: IdParamsSchema, body: TestStrategyRequestSchema }, async ({ params, body }) =>
      ok(await tester.test(params.id, body)),
    ),
  );

  return router;
}
