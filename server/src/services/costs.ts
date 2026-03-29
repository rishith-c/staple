import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@stapleai/db";
import { agentWakeupRequests, agents, companies, costEvents, heartbeatRuns, issues, projects } from "@stapleai/db";
import { notFound, unprocessable } from "../errors.js";
import { budgetService, type BudgetServiceHooks } from "./budgets.js";
import { estimateUsageCostCents } from "./model-pricing.js";

export interface CostDateRange {
  from?: Date;
  to?: Date;
}

const METERED_BILLING_TYPE = "metered_api";
const SUBSCRIPTION_BILLING_TYPES = ["subscription_included", "subscription_overage"] as const;

type CostCondition = ReturnType<typeof eq>;

interface UsageLedgerBaseRow {
  eventId: string;
  heartbeatRunId: string | null;
  agentId: string;
  agentName: string | null;
  agentStatus: string | null;
  adapterType: string | null;
  issueId: string | null;
  issueTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  provider: string;
  biller: string;
  billingType: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costCents: number;
  occurredAt: Date;
  requestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  requestedByActorType: string | null;
  requestedByActorId: string | null;
  invocationSource: string | null;
  triggerDetail: string | null;
  cwd: string | null;
  workspaceSource: string | null;
}

interface UsageLedgerRow extends UsageLedgerBaseRow {
  estimatedUnbilledCostCents: number;
  displayCostCents: number;
  costSource: "billed" | "estimated" | "estimated_inferred_model" | "none";
  pricingMatchedModel: string | null;
  pricingSourceUrl: string | null;
}

function buildConditions(companyId: string, range?: CostDateRange) {
  const conditions: CostCondition[] = [eq(costEvents.companyId, companyId)];
  if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
  if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));
  return conditions;
}

function enrichUsageLedgerRow(row: UsageLedgerBaseRow): UsageLedgerRow {
  if (row.costCents > 0) {
    return {
      ...row,
      estimatedUnbilledCostCents: 0,
      displayCostCents: row.costCents,
      costSource: "billed",
      pricingMatchedModel: null,
      pricingSourceUrl: null,
    };
  }

  const estimate = estimateUsageCostCents({
    model: row.model,
    inputTokens: row.inputTokens,
    cachedInputTokens: row.cachedInputTokens,
    outputTokens: row.outputTokens,
  });

  const estimatedUnbilledCostCents = estimate.costCents > 0 ? estimate.costCents : 0;
  const costSource =
    estimatedUnbilledCostCents > 0
      ? (estimate.pricing?.inferred ? "estimated_inferred_model" : "estimated")
      : "none";

  return {
    ...row,
    estimatedUnbilledCostCents,
    displayCostCents: row.costCents + estimatedUnbilledCostCents,
    costSource,
    pricingMatchedModel: estimate.pricing?.matchedModel ?? null,
    pricingSourceUrl: estimate.pricing?.sourceUrl ?? null,
  };
}

function currentUtcMonthWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  };
}

async function getMonthlySpendTotal(
  db: Db,
  scope: { companyId: string; agentId?: string | null },
) {
  const { start, end } = currentUtcMonthWindow();
  const conditions = [
    eq(costEvents.companyId, scope.companyId),
    gte(costEvents.occurredAt, start),
    lt(costEvents.occurredAt, end),
  ];
  if (scope.agentId) {
    conditions.push(eq(costEvents.agentId, scope.agentId));
  }
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
    })
    .from(costEvents)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export function costService(db: Db, budgetHooks: BudgetServiceHooks = {}) {
  const budgets = budgetService(db, budgetHooks);

  async function listUsageLedger(companyId: string, range?: CostDateRange, limit?: number) {
    const effectiveIssueId =
      sql<string | null>`coalesce(${costEvents.issueId}::text, ${heartbeatRuns.contextSnapshot} ->> 'issueId', ${agentWakeupRequests.payload} ->> 'issueId')`;
    const effectiveProjectId =
      sql<string | null>`coalesce(${costEvents.projectId}::text, ${heartbeatRuns.contextSnapshot} ->> 'projectId', ${agentWakeupRequests.payload} ->> 'projectId', ${issues.projectId}::text)`;
    const cwdExpr = sql<string | null>`${heartbeatRuns.contextSnapshot} -> 'stapleWorkspace' ->> 'cwd'`;
    const workspaceSourceExpr = sql<string | null>`${heartbeatRuns.contextSnapshot} -> 'stapleWorkspace' ->> 'source'`;

    const query = db
      .select({
        eventId: costEvents.id,
        heartbeatRunId: costEvents.heartbeatRunId,
        agentId: costEvents.agentId,
        agentName: agents.name,
        agentStatus: agents.status,
        adapterType: agents.adapterType,
        issueId: effectiveIssueId,
        issueTitle: issues.title,
        projectId: effectiveProjectId,
        projectName: projects.name,
        provider: costEvents.provider,
        biller: costEvents.biller,
        billingType: costEvents.billingType,
        model: costEvents.model,
        inputTokens: costEvents.inputTokens,
        cachedInputTokens: costEvents.cachedInputTokens,
        outputTokens: costEvents.outputTokens,
        costCents: costEvents.costCents,
        occurredAt: costEvents.occurredAt,
        requestedAt: agentWakeupRequests.requestedAt,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
        requestedByActorType: agentWakeupRequests.requestedByActorType,
        requestedByActorId: agentWakeupRequests.requestedByActorId,
        invocationSource: heartbeatRuns.invocationSource,
        triggerDetail: sql<string | null>`coalesce(${agentWakeupRequests.triggerDetail}, ${heartbeatRuns.triggerDetail})`,
        cwd: cwdExpr,
        workspaceSource: workspaceSourceExpr,
      })
      .from(costEvents)
      .leftJoin(heartbeatRuns, eq(costEvents.heartbeatRunId, heartbeatRuns.id))
      .leftJoin(agents, eq(costEvents.agentId, agents.id))
      .leftJoin(agentWakeupRequests, eq(heartbeatRuns.wakeupRequestId, agentWakeupRequests.id))
      .leftJoin(
        issues,
        and(
          eq(issues.companyId, companyId),
          sql`${issues.id}::text = ${effectiveIssueId}`,
        ),
      )
      .leftJoin(projects, sql`${projects.id}::text = ${effectiveProjectId}`)
      .where(and(...buildConditions(companyId, range)))
      .orderBy(desc(costEvents.occurredAt), desc(costEvents.createdAt));

    const rows = typeof limit === "number" ? await query.limit(limit) : await query;
    return rows.map((row) => enrichUsageLedgerRow(row as UsageLedgerBaseRow));
  }

  return {
    createEvent: async (companyId: string, data: Omit<typeof costEvents.$inferInsert, "companyId">) => {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, data.agentId))
        .then((rows) => rows[0] ?? null);

      if (!agent) throw notFound("Agent not found");
      if (agent.companyId !== companyId) {
        throw unprocessable("Agent does not belong to company");
      }

      const event = await db
        .insert(costEvents)
        .values({
          ...data,
          companyId,
          biller: data.biller ?? data.provider,
          billingType: data.billingType ?? "unknown",
          cachedInputTokens: data.cachedInputTokens ?? 0,
        })
        .returning()
        .then((rows) => rows[0]);

      const [agentMonthSpend, companyMonthSpend] = await Promise.all([
        getMonthlySpendTotal(db, { companyId, agentId: event.agentId }),
        getMonthlySpendTotal(db, { companyId }),
      ]);

      await db
        .update(agents)
        .set({
          spentMonthlyCents: agentMonthSpend,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, event.agentId));

      await db
        .update(companies)
        .set({
          spentMonthlyCents: companyMonthSpend,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));

      await budgets.evaluateCostEvent(event);

      return event;
    },

    summary: async (companyId: string, range?: CostDateRange) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const rows = await listUsageLedger(companyId, range);
      const spendCents = rows.reduce((sum, row) => sum + row.costCents, 0);
      const estimatedUnbilledSpendCents = rows.reduce((sum, row) => sum + row.estimatedUnbilledCostCents, 0);
      const displaySpendCents = spendCents + estimatedUnbilledSpendCents;
      const utilization =
        company.budgetMonthlyCents > 0
          ? (displaySpendCents / company.budgetMonthlyCents) * 100
          : 0;

      return {
        companyId,
        spendCents,
        estimatedUnbilledSpendCents,
        displaySpendCents,
        budgetCents: company.budgetMonthlyCents,
        utilizationPercent: Number(utilization.toFixed(2)),
      };
    },

    byAgent: async (companyId: string, range?: CostDateRange) => {
      const rows = await listUsageLedger(companyId, range);
      const groups = new Map<string, {
        agentId: string;
        agentName: string | null;
        agentStatus: string | null;
        costCents: number;
        estimatedUnbilledCostCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        apiRunIds: Set<string>;
        subscriptionRunIds: Set<string>;
        subscriptionCachedInputTokens: number;
        subscriptionInputTokens: number;
        subscriptionOutputTokens: number;
        lastOccurredAt: Date | null;
      }>();

      for (const row of rows) {
        const entry = groups.get(row.agentId) ?? {
          agentId: row.agentId,
          agentName: row.agentName,
          agentStatus: row.agentStatus,
          costCents: 0,
          estimatedUnbilledCostCents: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          apiRunIds: new Set<string>(),
          subscriptionRunIds: new Set<string>(),
          subscriptionCachedInputTokens: 0,
          subscriptionInputTokens: 0,
          subscriptionOutputTokens: 0,
          lastOccurredAt: null,
        };

        entry.costCents += row.costCents;
        entry.estimatedUnbilledCostCents += row.estimatedUnbilledCostCents;
        entry.inputTokens += row.inputTokens;
        entry.cachedInputTokens += row.cachedInputTokens;
        entry.outputTokens += row.outputTokens;
        if (!entry.lastOccurredAt || row.occurredAt > entry.lastOccurredAt) entry.lastOccurredAt = row.occurredAt;

        if (row.heartbeatRunId) {
          if (row.billingType === METERED_BILLING_TYPE) entry.apiRunIds.add(row.heartbeatRunId);
          if (SUBSCRIPTION_BILLING_TYPES.includes(row.billingType as typeof SUBSCRIPTION_BILLING_TYPES[number])) {
            entry.subscriptionRunIds.add(row.heartbeatRunId);
          }
        }

        if (SUBSCRIPTION_BILLING_TYPES.includes(row.billingType as typeof SUBSCRIPTION_BILLING_TYPES[number])) {
          entry.subscriptionInputTokens += row.inputTokens;
          entry.subscriptionCachedInputTokens += row.cachedInputTokens;
          entry.subscriptionOutputTokens += row.outputTokens;
        }

        groups.set(row.agentId, entry);
      }

      return Array.from(groups.values())
        .map((entry) => ({
          agentId: entry.agentId,
          agentName: entry.agentName,
          agentStatus: entry.agentStatus,
          costCents: entry.costCents,
          estimatedUnbilledCostCents: entry.estimatedUnbilledCostCents,
          inputTokens: entry.inputTokens,
          cachedInputTokens: entry.cachedInputTokens,
          outputTokens: entry.outputTokens,
          apiRunCount: entry.apiRunIds.size,
          subscriptionRunCount: entry.subscriptionRunIds.size,
          subscriptionCachedInputTokens: entry.subscriptionCachedInputTokens,
          subscriptionInputTokens: entry.subscriptionInputTokens,
          subscriptionOutputTokens: entry.subscriptionOutputTokens,
          lastOccurredAt: entry.lastOccurredAt,
          displayCostCents: entry.costCents + entry.estimatedUnbilledCostCents,
        }))
        .sort((a, b) => b.displayCostCents - a.displayCostCents || a.agentName?.localeCompare(b.agentName ?? "") || 0)
        .map(({ displayCostCents: _displayCostCents, ...entry }) => entry);
    },

    byProvider: async (companyId: string, range?: CostDateRange) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      return db
        .select({
          provider: costEvents.provider,
          biller: costEvents.biller,
          billingType: costEvents.billingType,
          model: costEvents.model,
          costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          cachedInputTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
          apiRunCount:
            sql<number>`count(distinct case when ${costEvents.billingType} = ${METERED_BILLING_TYPE} then ${costEvents.heartbeatRunId} end)::int`,
          subscriptionRunCount:
            sql<number>`count(distinct case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.heartbeatRunId} end)::int`,
          subscriptionCachedInputTokens:
            sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.cachedInputTokens} else 0 end), 0)::int`,
          subscriptionInputTokens:
            sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.inputTokens} else 0 end), 0)::int`,
          subscriptionOutputTokens:
            sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.outputTokens} else 0 end), 0)::int`,
        })
        .from(costEvents)
        .where(and(...conditions))
        .groupBy(costEvents.provider, costEvents.biller, costEvents.billingType, costEvents.model)
        .orderBy(desc(sql`coalesce(sum(${costEvents.costCents}), 0)::int`));
    },

    byBiller: async (companyId: string, range?: CostDateRange) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      return db
        .select({
          biller: costEvents.biller,
          costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          cachedInputTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
          apiRunCount:
            sql<number>`count(distinct case when ${costEvents.billingType} = ${METERED_BILLING_TYPE} then ${costEvents.heartbeatRunId} end)::int`,
          subscriptionRunCount:
            sql<number>`count(distinct case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.heartbeatRunId} end)::int`,
          subscriptionCachedInputTokens:
            sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.cachedInputTokens} else 0 end), 0)::int`,
          subscriptionInputTokens:
            sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.inputTokens} else 0 end), 0)::int`,
          subscriptionOutputTokens:
            sql<number>`coalesce(sum(case when ${costEvents.billingType} in (${sql.join(SUBSCRIPTION_BILLING_TYPES.map((value) => sql`${value}`), sql`, `)}) then ${costEvents.outputTokens} else 0 end), 0)::int`,
          providerCount: sql<number>`count(distinct ${costEvents.provider})::int`,
          modelCount: sql<number>`count(distinct ${costEvents.model})::int`,
        })
        .from(costEvents)
        .where(and(...conditions))
        .groupBy(costEvents.biller)
        .orderBy(desc(sql`coalesce(sum(${costEvents.costCents}), 0)::int`));
    },

    /**
     * aggregates cost_events by provider for each of three rolling windows:
     * last 5 hours, last 24 hours, last 7 days.
     * purely internal consumption data, no external rate-limit sources.
     */
    windowSpend: async (companyId: string) => {
      const windows = [
        { label: "5h", hours: 5 },
        { label: "24h", hours: 24 },
        { label: "7d", hours: 168 },
      ] as const;

      const results = await Promise.all(
        windows.map(async ({ label, hours }) => {
          const since = new Date(Date.now() - hours * 60 * 60 * 1000);
          const rows = await db
            .select({
              provider: costEvents.provider,
              biller: sql<string>`case when count(distinct ${costEvents.biller}) = 1 then min(${costEvents.biller}) else 'mixed' end`,
              costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
              inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
              cachedInputTokens: sql<number>`coalesce(sum(${costEvents.cachedInputTokens}), 0)::int`,
              outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
            })
            .from(costEvents)
            .where(
              and(
                eq(costEvents.companyId, companyId),
                gte(costEvents.occurredAt, since),
              ),
            )
            .groupBy(costEvents.provider)
            .orderBy(desc(sql`coalesce(sum(${costEvents.costCents}), 0)::int`));

          return rows.map((row) => ({
            provider: row.provider,
            biller: row.biller,
            window: label as string,
            windowHours: hours,
            costCents: row.costCents,
            inputTokens: row.inputTokens,
            cachedInputTokens: row.cachedInputTokens,
            outputTokens: row.outputTokens,
          }));
        }),
      );

      return results.flat();
    },

    byAgentModel: async (companyId: string, range?: CostDateRange) => {
      const rows = await listUsageLedger(companyId, range);
      const groups = new Map<string, {
        agentId: string;
        agentName: string | null;
        provider: string;
        biller: string;
        billingType: string;
        model: string;
        costCents: number;
        estimatedUnbilledCostCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
      }>();

      for (const row of rows) {
        const key = [row.agentId, row.provider, row.biller, row.billingType, row.model].join(":");
        const entry = groups.get(key) ?? {
          agentId: row.agentId,
          agentName: row.agentName,
          provider: row.provider,
          biller: row.biller,
          billingType: row.billingType,
          model: row.model,
          costCents: 0,
          estimatedUnbilledCostCents: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
        };
        entry.costCents += row.costCents;
        entry.estimatedUnbilledCostCents += row.estimatedUnbilledCostCents;
        entry.inputTokens += row.inputTokens;
        entry.cachedInputTokens += row.cachedInputTokens;
        entry.outputTokens += row.outputTokens;
        groups.set(key, entry);
      }

      return Array.from(groups.values()).sort(
        (a, b) =>
          (b.costCents + b.estimatedUnbilledCostCents) - (a.costCents + a.estimatedUnbilledCostCents) ||
          a.provider.localeCompare(b.provider) ||
          a.model.localeCompare(b.model),
      );
    },

    byProject: async (companyId: string, range?: CostDateRange) => {
      const rows = await listUsageLedger(companyId, range);
      const groups = new Map<string, {
        projectId: string | null;
        projectName: string | null;
        costCents: number;
        estimatedUnbilledCostCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        lastOccurredAt: Date | null;
      }>();

      for (const row of rows) {
        const key = row.projectId ?? "__misc__";
        const entry = groups.get(key) ?? {
          projectId: row.projectId,
          projectName: row.projectName,
          costCents: 0,
          estimatedUnbilledCostCents: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          lastOccurredAt: null,
        };
        entry.costCents += row.costCents;
        entry.estimatedUnbilledCostCents += row.estimatedUnbilledCostCents;
        entry.inputTokens += row.inputTokens;
        entry.cachedInputTokens += row.cachedInputTokens;
        entry.outputTokens += row.outputTokens;
        if (!entry.lastOccurredAt || row.occurredAt > entry.lastOccurredAt) entry.lastOccurredAt = row.occurredAt;
        groups.set(key, entry);
      }

      return Array.from(groups.values()).sort(
        (a, b) =>
          (b.costCents + b.estimatedUnbilledCostCents) - (a.costCents + a.estimatedUnbilledCostCents) ||
          (a.projectName ?? "").localeCompare(b.projectName ?? ""),
      );
    },

    byRuntimeProject: async (companyId: string, range?: CostDateRange) => {
      const rows = await listUsageLedger(companyId, range);
      const groups = new Map<string, {
        adapterType: string | null;
        projectId: string | null;
        projectName: string | null;
        costCents: number;
        estimatedUnbilledCostCents: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        agentIds: Set<string>;
        runIds: Set<string>;
        lastOccurredAt: Date | null;
      }>();

      for (const row of rows) {
        const key = `${row.adapterType ?? "other"}:${row.projectId ?? "__misc__"}`;
        const entry = groups.get(key) ?? {
          adapterType: row.adapterType,
          projectId: row.projectId,
          projectName: row.projectName,
          costCents: 0,
          estimatedUnbilledCostCents: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          agentIds: new Set<string>(),
          runIds: new Set<string>(),
          lastOccurredAt: null,
        };
        entry.costCents += row.costCents;
        entry.estimatedUnbilledCostCents += row.estimatedUnbilledCostCents;
        entry.inputTokens += row.inputTokens;
        entry.cachedInputTokens += row.cachedInputTokens;
        entry.outputTokens += row.outputTokens;
        entry.agentIds.add(row.agentId);
        if (row.heartbeatRunId) entry.runIds.add(row.heartbeatRunId);
        if (!entry.lastOccurredAt || row.occurredAt > entry.lastOccurredAt) entry.lastOccurredAt = row.occurredAt;
        groups.set(key, entry);
      }

      return Array.from(groups.values())
        .map((entry) => ({
          adapterType: entry.adapterType,
          projectId: entry.projectId,
          projectName: entry.projectName,
          costCents: entry.costCents,
          estimatedUnbilledCostCents: entry.estimatedUnbilledCostCents,
          inputTokens: entry.inputTokens,
          cachedInputTokens: entry.cachedInputTokens,
          outputTokens: entry.outputTokens,
          agentCount: entry.agentIds.size,
          runCount: entry.runIds.size,
          lastOccurredAt: entry.lastOccurredAt,
          displayCostCents: entry.costCents + entry.estimatedUnbilledCostCents,
        }))
        .sort((a, b) => b.displayCostCents - a.displayCostCents || (a.adapterType ?? "").localeCompare(b.adapterType ?? ""))
        .map(({ displayCostCents: _displayCostCents, ...entry }) => entry);
    },

    usageLog: async (companyId: string, range?: CostDateRange, limit: number = 50) =>
      listUsageLedger(companyId, range, limit),
  };
}
