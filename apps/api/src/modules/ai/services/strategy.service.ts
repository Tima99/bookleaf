import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import {
  AiStrategyConfigSchema,
  RULE_LIMITS,
  TICKET_CATEGORIES,
  type AiStrategyConfig,
  type AiStrategyDto,
  type AiStrategyKind,
  type AiStrategyVersionDto,
  type CreateStrategyRequest,
  type TicketCategory,
  type TicketPriority,
  type UpdateStrategyRequest,
  type UrgencyRule,
} from '@bookleaf/contracts';
import { ConflictError, NotFoundError, ValidationError } from '../../../common/errors';
import type { AuthUser } from '../../../common/auth-user';
import {
  AiRunModel,
  AiStrategyModel,
  AiStrategyVersionModel,
  type AiStrategyDoc,
  type AiStrategyVersionDoc,
} from '../../../database/models';
import { actorFrom, type AuditService } from '../../audit/audit.service';
import type { ResolvedStrategy } from '../prompts/types';
import {
  buildDefaultStrategies,
  DEFAULT_SORTING_RULES,
  defaultUrgencyRules,
  type DefaultStrategy,
} from '../strategies/defaults';

const CACHE_TTL_MS = 30_000;

const LEVEL_IN_TEXT = /\s*→\s*(CRITICAL|HIGH|MEDIUM|LOW)\b\.?/i;

/** Old free-text urgency guidance ("… → HIGH") as one rule, keeping the wording. */
function toUrgencyRule(text: string): UrgencyRule {
  const level = text.match(LEVEL_IN_TEXT)?.[1]?.toUpperCase() as TicketPriority | undefined;
  const description = text.replace(LEVEL_IN_TEXT, '').trim() || text.trim();
  return {
    description: description.slice(0, RULE_LIMITS.descriptionMax),
    priority: level ?? 'MEDIUM',
  };
}

function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 11000
  );
}

/**
 * Admin-configurable AI strategies with immutable versions.
 *
 * - Every config change creates a new version; tickets store the strategy id + version
 *   used, so history is never rewritten.
 * - At most one enabled strategy per (kind, category) — resolution is unambiguous.
 * - If no strategy is enabled for a scope, the built-in default (in code) is used.
 * - Active configurations are cached in-process for 30s and invalidated on every write,
 *   so ticket triage doesn't hit MongoDB for strategy lookups on every call.
 */
export class StrategyService {
  private readonly defaults = buildDefaultStrategies();
  private cache = new Map<string, { value: ResolvedStrategy; expiresAt: number }>();

  constructor(private readonly audit: AuditService) {}

  /* ---------------------------- resolution ---------------------------- */

  async resolveActive(
    kind: AiStrategyKind,
    category: TicketCategory | null,
  ): Promise<ResolvedStrategy> {
    const cacheKey = `${kind}:${category ?? '*'}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const strategy = await AiStrategyModel.findOne({ kind, category, enabled: true }).lean();
    let resolved: ResolvedStrategy;
    if (strategy) {
      const version = await AiStrategyVersionModel.findOne({
        strategy: strategy._id,
        version: strategy.activeVersion,
      }).lean();
      resolved = version ? this.toResolved(strategy, version) : this.builtIn(kind, category);
    } else {
      resolved = this.builtIn(kind, category);
    }
    this.cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolved;
  }

  async resolveTriageStrategies(): Promise<{
    classification: ResolvedStrategy;
    priorities: ResolvedStrategy[];
  }> {
    const [classification, ...priorities] = await Promise.all([
      this.resolveActive('CLASSIFICATION', null),
      ...TICKET_CATEGORIES.map((c) => this.resolveActive('PRIORITY', c)),
    ]);
    if (!classification) throw new Error('classification strategy missing');
    return { classification, priorities };
  }

  /** Resolve a specific (possibly inactive) version — used by the strategy test console. */
  async resolveVersion(strategyId: string, version?: number): Promise<ResolvedStrategy> {
    const strategy = await this.findStrategy(strategyId);
    const v = await AiStrategyVersionModel.findOne({
      strategy: strategy._id,
      version: version ?? strategy.activeVersion,
    }).lean();
    if (!v) throw new NotFoundError('Strategy version');
    return this.toResolved(strategy, v);
  }

  private builtIn(kind: AiStrategyKind, category: TicketCategory | null): ResolvedStrategy {
    const def = this.defaults.find((d) => d.kind === kind && d.category === category);
    if (!def) throw new Error(`No built-in default strategy for ${kind}/${category}`);
    return {
      strategyId: null,
      name: `${def.name} (built-in)`,
      kind,
      category,
      version: 0,
      config: AiStrategyConfigSchema.parse(def.config),
    };
  }

  private toResolved(strategy: AiStrategyDoc, version: AiStrategyVersionDoc): ResolvedStrategy {
    return {
      strategyId: strategy._id.toString(),
      name: strategy.name,
      kind: strategy.kind,
      category: strategy.category,
      version: version.version,
      // Stored configs were validated on write; parse again to apply new schema defaults.
      config: AiStrategyConfigSchema.parse(version.config),
    };
  }

  private invalidate(): void {
    this.cache.clear();
  }

  /* ------------------------------ seeding ----------------------------- */

  /** Idempotent: inserts missing default strategies; never overwrites admin edits. */
  async ensureDefaults(): Promise<{ created: number }> {
    let created = 0;
    for (const def of this.defaults) {
      const exists = await AiStrategyModel.exists({ key: def.key });
      if (exists) {
        // Built-in names have changed over time; only names nobody edited are updated.
        if (def.legacy) {
          const renamed = await AiStrategyModel.updateOne(
            { key: def.key, isDefault: true, name: { $in: def.legacy.names } },
            { $set: { name: def.name } },
          );
          const described = await AiStrategyModel.updateOne(
            { key: def.key, isDefault: true, purpose: { $in: def.legacy.purposes } },
            { $set: { purpose: def.purpose } },
          );
          if (renamed.modifiedCount || described.modifiedCount) this.invalidate();
        }
        continue;
      }
      await this.insertStrategy(def, true, null);
      created += 1;
    }
    if (created) this.invalidate();
    await this.moveUrgencyGuidance();
    return { created };
  }

  /**
   * One-time move. Urgency guidance used to be free text on each category's urgency
   * setting; it now lives as rules on the Category & Priority setting (its Priority tab),
   * so staff see everything AI follows in one list. Untouched defaults become the built-in
   * rules; edited text is kept word for word. Runs only while some urgency setting still
   * has text, so it is idempotent. Old versions stay in History.
   */
  private async moveUrgencyGuidance(): Promise<void> {
    const sorting = await AiStrategyModel.findOne({
      kind: 'CLASSIFICATION',
      category: null,
      enabled: true,
    }).lean();
    if (!sorting) return;

    const moved: UrgencyRule[] = [];
    const cleared: Array<{ strategy: AiStrategyDoc; config: AiStrategyConfig }> = [];
    for (const strategy of await AiStrategyModel.find({ kind: 'PRIORITY', enabled: true }).lean()) {
      const config = await this.activeConfig(strategy);
      if (!config?.priorityRules.length) continue;
      const untouched = strategy.isDefault && strategy.activeVersion === 1;
      moved.push(
        ...(untouched && strategy.category
          ? defaultUrgencyRules(strategy.category)
          : config.priorityRules.map(toUrgencyRule)),
      );
      cleared.push({ strategy, config: { ...config, priorityRules: [] } });
    }
    if (!cleared.length) return;

    const sortingConfig = await this.activeConfig(sorting);
    if (!sortingConfig) return;
    const sortingUntouched = sorting.isDefault && sorting.activeVersion === 1;
    const note = 'Moved urgency guidance into the Priority rules list';
    await this.saveSystemVersion(
      sorting,
      {
        ...sortingConfig,
        sortingRules:
          sortingUntouched && !sortingConfig.sortingRules.length
            ? DEFAULT_SORTING_RULES
            : sortingConfig.sortingRules,
        urgencyRules: [...sortingConfig.urgencyRules, ...moved].slice(0, RULE_LIMITS.rulesMax),
      },
      note,
    );
    for (const { strategy, config } of cleared) {
      await this.saveSystemVersion(strategy, config, note);
    }
    this.invalidate();
  }

  private async activeConfig(strategy: AiStrategyDoc): Promise<AiStrategyConfig | null> {
    const version = await AiStrategyVersionModel.findOne({
      strategy: strategy._id,
      version: strategy.activeVersion,
    }).lean();
    return version ? AiStrategyConfigSchema.parse(version.config) : null;
  }

  /** Saves and activates a new version made by the system (no signed-in user). */
  private async saveSystemVersion(
    strategy: AiStrategyDoc,
    config: AiStrategyConfig,
    changeNote: string,
  ): Promise<void> {
    const version = strategy.latestVersion + 1;
    await AiStrategyVersionModel.create({
      strategy: strategy._id,
      version,
      config,
      changeNote,
      createdBy: null,
      createdByName: 'System',
    });
    await AiStrategyModel.updateOne(
      { _id: strategy._id },
      { $set: { latestVersion: version, activeVersion: version } },
    );
  }

  private async insertStrategy(def: DefaultStrategy, isDefault: boolean, user: AuthUser | null) {
    const config = AiStrategyConfigSchema.parse(def.config);
    // Only enable if nothing else is enabled in the scope (keeps the invariant on re-seed).
    const scopeTaken = await AiStrategyModel.exists({
      kind: def.kind,
      category: def.category,
      enabled: true,
    });
    const strategy = await AiStrategyModel.create({
      key: def.key,
      name: def.name,
      kind: def.kind,
      category: def.category,
      purpose: def.purpose,
      enabled: !scopeTaken,
      isDefault,
      activeVersion: 1,
      latestVersion: 1,
      updatedBy: user ? new Types.ObjectId(user.id) : null,
      updatedByName: user?.name ?? null,
    });
    await AiStrategyVersionModel.create({
      strategy: strategy._id,
      version: 1,
      config,
      changeNote: isDefault ? 'Built-in default' : 'Initial version',
      createdBy: user ? new Types.ObjectId(user.id) : null,
      createdByName: user?.name ?? 'System',
    });
    return strategy;
  }

  /* -------------------------------- CRUD ------------------------------ */

  async list(filter: {
    kind?: AiStrategyKind;
    category?: TicketCategory;
  }): Promise<AiStrategyDto[]> {
    const query: Record<string, unknown> = {};
    if (filter.kind) query.kind = filter.kind;
    if (filter.category) query.category = filter.category;
    const strategies = await AiStrategyModel.find(query)
      .sort({ kind: 1, category: 1, enabled: -1, name: 1 })
      .lean();
    if (!strategies.length) return [];

    const ids = strategies.map((s) => s._id);
    const [versions, stats] = await Promise.all([
      AiStrategyVersionModel.find({
        $or: strategies.map((s) => ({ strategy: s._id, version: s.activeVersion })),
      }).lean(),
      AiRunModel.aggregate<{
        _id: Types.ObjectId;
        runs: number;
        failures: number;
        lastRunAt: Date;
      }>([
        { $match: { 'strategies.strategy': { $in: ids } } },
        { $unwind: '$strategies' },
        { $match: { 'strategies.strategy': { $in: ids } } },
        {
          $group: {
            _id: '$strategies.strategy',
            runs: { $sum: 1 },
            failures: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
            lastRunAt: { $max: '$createdAt' },
          },
        },
      ]),
    ]);
    const versionByStrategy = new Map(versions.map((v) => [v.strategy.toString(), v]));
    const statsByStrategy = new Map(stats.map((s) => [s._id.toString(), s]));
    return strategies.map((s) => {
      const version = versionByStrategy.get(s._id.toString());
      return this.toDto(s, version?.config, statsByStrategy.get(s._id.toString()));
    });
  }

  async get(id: string): Promise<AiStrategyDto> {
    const strategy = await this.findStrategy(id);
    const [version, stats] = await Promise.all([
      AiStrategyVersionModel.findOne({
        strategy: strategy._id,
        version: strategy.activeVersion,
      }).lean(),
      AiRunModel.aggregate<{ runs: number; failures: number; lastRunAt: Date }>([
        { $match: { 'strategies.strategy': strategy._id } },
        {
          $group: {
            _id: null,
            runs: { $sum: 1 },
            failures: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
            lastRunAt: { $max: '$createdAt' },
          },
        },
      ]),
    ]);
    return this.toDto(strategy, version?.config, stats[0]);
  }

  async listVersions(id: string): Promise<AiStrategyVersionDto[]> {
    const strategy = await this.findStrategy(id);
    const versions = await AiStrategyVersionModel.find({ strategy: strategy._id })
      .sort({ version: -1 })
      .limit(50)
      .lean();
    return versions.map((v) => ({
      version: v.version,
      config: AiStrategyConfigSchema.parse(v.config),
      changeNote: v.changeNote,
      createdBy: v.createdByName,
      createdAt: v.createdAt.toISOString(),
      isActive: v.version === strategy.activeVersion,
    }));
  }

  async create(input: CreateStrategyRequest, user: AuthUser): Promise<AiStrategyDto> {
    const key = `${input.kind.toLowerCase()}.${(input.category ?? 'global').toLowerCase()}.${randomBytes(4).toString('hex')}`;
    if (input.enabled) await this.disableScope(input.kind, input.category, null);
    try {
      const strategy = await this.insertStrategy(
        {
          key,
          name: input.name,
          kind: input.kind,
          category: input.category,
          purpose: input.purpose,
          config: input.config,
        },
        false,
        user,
      );
      if (!input.enabled)
        await AiStrategyModel.updateOne({ _id: strategy._id }, { $set: { enabled: false } });
      await this.audit.record({
        entityType: 'AI_STRATEGY',
        entityId: strategy._id,
        action: 'strategy.created',
        summary: `Created strategy "${input.name}"`,
        actor: actorFrom(user),
      });
      this.invalidate();
      return this.get(strategy._id.toString());
    } catch (err) {
      if (isDuplicateKey(err))
        throw new ConflictError('Another strategy is already enabled for this scope');
      throw err;
    }
  }

  async update(id: string, input: UpdateStrategyRequest, user: AuthUser): Promise<AiStrategyDto> {
    const strategy = await this.findStrategy(id);
    const set: Partial<AiStrategyDoc> = {
      updatedBy: new Types.ObjectId(user.id),
      updatedByName: user.name,
    };
    const changes: string[] = [];

    if (input.name !== undefined && input.name !== strategy.name) {
      set.name = input.name;
      changes.push('renamed');
    }
    if (input.purpose !== undefined) set.purpose = input.purpose;

    if (input.config) {
      const nextVersion = strategy.latestVersion + 1;
      await AiStrategyVersionModel.create({
        strategy: strategy._id,
        version: nextVersion,
        config: input.config,
        changeNote: input.changeNote ?? '',
        createdBy: new Types.ObjectId(user.id),
        createdByName: user.name,
      });
      set.latestVersion = nextVersion;
      if (input.activate) set.activeVersion = nextVersion;
      changes.push(`saved v${nextVersion}${input.activate ? ' (active)' : ''}`);
    }

    try {
      if (input.enabled !== undefined && input.enabled !== strategy.enabled) {
        if (input.enabled) await this.disableScope(strategy.kind, strategy.category, strategy._id);
        set.enabled = input.enabled;
        changes.push(input.enabled ? 'enabled' : 'disabled');
      }
      await AiStrategyModel.updateOne({ _id: strategy._id }, { $set: set });
    } catch (err) {
      if (isDuplicateKey(err))
        throw new ConflictError('Another strategy is already enabled for this scope');
      throw err;
    }

    await this.audit.record({
      entityType: 'AI_STRATEGY',
      entityId: strategy._id,
      action: 'strategy.updated',
      summary: `Strategy "${set.name ?? strategy.name}": ${changes.join(', ') || 'details updated'}`,
      actor: actorFrom(user),
    });
    this.invalidate();
    return this.get(id);
  }

  async activateVersion(id: string, version: number, user: AuthUser): Promise<AiStrategyDto> {
    const strategy = await this.findStrategy(id);
    const exists = await AiStrategyVersionModel.exists({ strategy: strategy._id, version });
    if (!exists) throw new NotFoundError('Strategy version');
    await AiStrategyModel.updateOne(
      { _id: strategy._id },
      {
        $set: {
          activeVersion: version,
          updatedBy: new Types.ObjectId(user.id),
          updatedByName: user.name,
        },
      },
    );
    await this.audit.record({
      entityType: 'AI_STRATEGY',
      entityId: strategy._id,
      action: 'strategy.version_activated',
      summary: `Strategy "${strategy.name}": activated v${version} (was v${strategy.activeVersion})`,
      actor: actorFrom(user),
    });
    this.invalidate();
    return this.get(id);
  }

  async duplicate(id: string, user: AuthUser): Promise<AiStrategyDto> {
    const source = await this.resolveVersion(id);
    const original = await this.findStrategy(id);
    return this.create(
      {
        name: `Copy of ${original.name}`.slice(0, 80),
        purpose: original.purpose,
        enabled: false,
        kind: original.kind,
        category: original.category,
        config: source.config,
        changeNote: `Duplicated from "${original.name}" v${source.version}`,
      },
      user,
    );
  }

  private async disableScope(
    kind: AiStrategyKind,
    category: TicketCategory | null,
    except: Types.ObjectId | null,
  ) {
    await AiStrategyModel.updateMany(
      { kind, category, enabled: true, ...(except ? { _id: { $ne: except } } : {}) },
      { $set: { enabled: false } },
    );
  }

  private async findStrategy(id: string): Promise<AiStrategyDoc> {
    if (!Types.ObjectId.isValid(id)) throw new ValidationError('Invalid strategy id');
    const strategy = await AiStrategyModel.findById(id).lean();
    if (!strategy) throw new NotFoundError('Strategy');
    return strategy;
  }

  private toDto(
    s: AiStrategyDoc,
    rawConfig: unknown,
    stats?: { runs: number; failures: number; lastRunAt: Date },
  ): AiStrategyDto {
    const config: AiStrategyConfig = rawConfig
      ? AiStrategyConfigSchema.parse(rawConfig)
      : this.builtIn(s.kind, s.category).config;
    return {
      id: s._id.toString(),
      key: s.key,
      name: s.name,
      kind: s.kind,
      category: s.category,
      purpose: s.purpose,
      enabled: s.enabled,
      isDefault: s.isDefault,
      activeVersion: s.activeVersion,
      latestVersion: s.latestVersion,
      config,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      updatedBy: s.updatedByName,
      stats: {
        runs: stats?.runs ?? 0,
        failures: stats?.failures ?? 0,
        lastRunAt: stats?.lastRunAt ? stats.lastRunAt.toISOString() : null,
      },
    };
  }
}
