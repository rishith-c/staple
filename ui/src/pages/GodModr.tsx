import { useEffect, useMemo } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  Bot,
  CircleDot,
  ShieldCheck,
  Target,
  Activity,
  AlertTriangle,
  XCircle,
  Clock,
  Pause,
  ExternalLink,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { dashboardApi } from "../api/dashboard";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { activityApi } from "../api/activity";
import { goalsApi } from "../api/goals";
import { approvalsApi } from "../api/approvals";
import { heartbeatsApi } from "../api/heartbeats";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { formatCents, cn } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusIcon } from "../components/StatusIcon";
import { Identity } from "../components/Identity";
import { ActivityRow } from "../components/ActivityRow";
import { approvalLabel } from "../components/ApprovalPayload";
import type { Agent, Issue } from "@stapleai/shared";

export function GodModr() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "God Mode" }]);
  }, [setBreadcrumbs]);

  // --- Data fetching ---
  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5_000,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5_000,
  });

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: pendingApprovals } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5_000,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // --- Derived data ---
  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const activeIssues = useMemo(
    () => (issues ?? []).filter((i) => i.status === "in_progress" || i.status === "in_review"),
    [issues],
  );

  const blockedIssues = useMemo(
    () => (issues ?? []).filter((i) => i.status === "blocked"),
    [issues],
  );

  const recentActivity = useMemo(() => (activity ?? []).slice(0, 15), [activity]);

  const activeRuns = useMemo(
    () => (liveRuns ?? []).filter((r) => r.status === "running" || r.status === "queued"),
    [liveRuns],
  );

  const agentsByStatus = useMemo(() => {
    const groups = { running: [] as Agent[], active: [] as Agent[], paused: [] as Agent[], error: [] as Agent[] };
    const runningAgentIds = new Set(activeRuns.map((r) => r.agentId));
    for (const a of agents ?? []) {
      if (runningAgentIds.has(a.id)) groups.running.push(a);
      else if (a.status === "paused") groups.paused.push(a);
      else if (a.status === "error") groups.error.push(a);
      else groups.active.push(a);
    }
    return groups;
  }, [agents, activeRuns]);

  // --- Guards ---
  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={Zap}
        message={
          companies.length === 0
            ? "Create a company to enter God Mode."
            : "Select a company to enter God Mode."
        }
        action={companies.length === 0 ? "Get Started" : undefined}
        onAction={companies.length === 0 ? openOnboarding : undefined}
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-bold tracking-tight">God Mode</h1>
        </div>
        <span className="text-xs text-muted-foreground">
          Full system view &middot; auto-refreshing
        </span>
      </div>

      {/* Metric strip */}
      {summary && (
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
          <MiniMetric label="Agents" value={agentsByStatus.running.length + agentsByStatus.active.length + agentsByStatus.paused.length + agentsByStatus.error.length} />
          <MiniMetric label="Running" value={activeRuns.length} highlight={activeRuns.length > 0 ? "cyan" : undefined} />
          <MiniMetric label="In Progress" value={activeIssues.length} />
          <MiniMetric label="Blocked" value={blockedIssues.length} highlight={blockedIssues.length > 0 ? "red" : undefined} />
          <MiniMetric label="Approvals" value={pendingApprovals?.length ?? summary.pendingApprovals} highlight={(pendingApprovals?.length ?? summary.pendingApprovals) > 0 ? "amber" : undefined} />
          <MiniMetric label="Spend" value={formatCents(summary.costs.monthSpendCents)} />
        </div>
      )}

      {/* Main 3-column grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Column 1: Agents */}
        <div className="space-y-4">
          <SectionHeader icon={Bot} label="Agents" count={agents?.length} to="/agents" />

          {/* Running agents */}
          {agentsByStatus.running.length > 0 && (
            <div className="space-y-1">
              <SubLabel>Running Now</SubLabel>
              {agentsByStatus.running.map((agent) => {
                const run = activeRuns.find((r) => r.agentId === agent.id);
                return (
                  <AgentRow key={agent.id} agent={agent} status="running" run={run} issues={issues} />
                );
              })}
            </div>
          )}

          {/* Error agents */}
          {agentsByStatus.error.length > 0 && (
            <div className="space-y-1">
              <SubLabel>Errors</SubLabel>
              {agentsByStatus.error.map((agent) => (
                <AgentRow key={agent.id} agent={agent} status="error" issues={issues} />
              ))}
            </div>
          )}

          {/* Paused agents */}
          {agentsByStatus.paused.length > 0 && (
            <div className="space-y-1">
              <SubLabel>Paused</SubLabel>
              {agentsByStatus.paused.map((agent) => (
                <AgentRow key={agent.id} agent={agent} status="paused" issues={issues} />
              ))}
            </div>
          )}

          {/* Idle agents */}
          {agentsByStatus.active.length > 0 && (
            <div className="space-y-1">
              <SubLabel>Idle</SubLabel>
              {agentsByStatus.active.map((agent) => (
                <AgentRow key={agent.id} agent={agent} status="idle" issues={issues} />
              ))}
            </div>
          )}

          {agents?.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No agents configured.</p>
          )}

          {/* Goals summary */}
          {goals && goals.length > 0 && (
            <>
              <SectionHeader icon={Target} label="Goals" count={goals.length} to="/goals" />
              <div className="space-y-1">
                {goals.slice(0, 6).map((goal) => (
                  <Link
                    key={goal.id}
                    to={`/goals/${goal.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors no-underline text-inherit"
                  >
                    <Target className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{goal.title}</span>
                    {goal.status && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full shrink-0",
                        goal.status === "achieved" && "bg-green-500/10 text-green-600 dark:text-green-400",
                        goal.status === "active" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                        goal.status === "cancelled" && "bg-red-500/10 text-red-600 dark:text-red-400",
                        goal.status === "planned" && "bg-muted text-muted-foreground",
                      )}>
                        {goal.status}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Column 2: Issues & Approvals */}
        <div className="space-y-4">
          <SectionHeader icon={CircleDot} label="Active Issues" count={activeIssues.length} to="/issues" />
          {activeIssues.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">No active issues.</p>
          ) : (
            <div className="space-y-0.5">
              {activeIssues.slice(0, 12).map((issue) => (
                <IssueRow key={issue.id} issue={issue} agentMap={agentMap} />
              ))}
              {activeIssues.length > 12 && (
                <Link to="/issues" className="block text-xs text-muted-foreground hover:text-foreground px-2 py-1 no-underline">
                  +{activeIssues.length - 12} more
                </Link>
              )}
            </div>
          )}

          {blockedIssues.length > 0 && (
            <>
              <SectionHeader icon={AlertTriangle} label="Blocked" count={blockedIssues.length} />
              <div className="space-y-0.5">
                {blockedIssues.slice(0, 5).map((issue) => (
                  <IssueRow key={issue.id} issue={issue} agentMap={agentMap} />
                ))}
              </div>
            </>
          )}

          {pendingApprovals && pendingApprovals.length > 0 && (
            <>
              <SectionHeader icon={ShieldCheck} label="Pending Approvals" count={pendingApprovals.length} to="/approvals/pending" />
              <div className="space-y-0.5">
                {pendingApprovals.slice(0, 6).map((approval) => (
                  <Link
                    key={approval.id}
                    to={`/approvals/${approval.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors no-underline text-inherit"
                  >
                    <ShieldCheck className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="truncate flex-1">{approvalLabel(approval.type, approval.payload as Record<string, unknown> | null)}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(approval.createdAt)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Column 3: Activity Feed */}
        <div className="space-y-4">
          <SectionHeader icon={Activity} label="Live Activity" count={recentActivity.length} to="/activity" />
          {recentActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">No recent activity.</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {recentActivity.map((event) => (
                <ActivityRow
                  key={event.id}
                  event={event}
                  agentMap={agentMap}
                  entityNameMap={entityNameMap}
                  entityTitleMap={entityTitleMap}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function MiniMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "cyan" | "red" | "amber";
}) {
  return (
    <div className={cn(
      "rounded-lg border px-3 py-2",
      highlight === "cyan" && "border-cyan-500/25 bg-cyan-500/5",
      highlight === "red" && "border-red-500/25 bg-red-500/5",
      highlight === "amber" && "border-amber-500/25 bg-amber-500/5",
      !highlight && "border-border",
    )}>
      <div className={cn(
        "text-lg font-semibold tabular-nums",
        highlight === "cyan" && "text-cyan-600 dark:text-cyan-400",
        highlight === "red" && "text-red-600 dark:text-red-400",
        highlight === "amber" && "text-amber-600 dark:text-amber-400",
      )}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  to,
}: {
  icon: typeof Bot;
  label: string;
  count?: number;
  to?: string;
}) {
  const inner = (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {count !== undefined && (
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">{count}</span>
      )}
      {to && <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/40 ml-auto" />}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block no-underline text-inherit hover:opacity-80 transition-opacity">
        {inner}
      </Link>
    );
  }

  return inner;
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider px-2">
      {children}
    </div>
  );
}

function AgentRow({
  agent,
  status,
  run,
  issues,
}: {
  agent: Agent;
  status: "running" | "error" | "paused" | "idle";
  run?: { id: string; issueId?: string | null };
  issues?: Issue[];
}) {
  const issue = run?.issueId ? issues?.find((i) => i.id === run.issueId) : undefined;

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors no-underline text-inherit"
    >
      {status === "running" && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
        </span>
      )}
      {status === "error" && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
      {status === "paused" && <Pause className="h-3 w-3 text-amber-500 shrink-0" />}
      {status === "idle" && <Clock className="h-3 w-3 text-muted-foreground/50 shrink-0" />}

      <Identity name={agent.name} size="xs" />

      {issue && (
        <span className="truncate text-[10px] text-muted-foreground ml-auto max-w-[120px]">
          {issue.identifier ?? issue.id.slice(0, 8)}
        </span>
      )}
    </Link>
  );
}

function IssueRow({ issue, agentMap }: { issue: Issue; agentMap: Map<string, Agent> }) {
  const assignee = issue.assigneeAgentId ? agentMap.get(issue.assigneeAgentId) : undefined;

  return (
    <Link
      to={`/issues/${issue.identifier ?? issue.id}`}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors no-underline text-inherit"
    >
      <StatusIcon status={issue.status} className="h-3 w-3" />
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
        {issue.identifier ?? issue.id.slice(0, 8)}
      </span>
      <span className="truncate flex-1 min-w-0">{issue.title}</span>
      {assignee && (
        <Identity name={assignee.name} size="xs" className="shrink-0 ml-auto" />
      )}
      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(issue.updatedAt)}</span>
    </Link>
  );
}
