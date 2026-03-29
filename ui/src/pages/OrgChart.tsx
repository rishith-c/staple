import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { projectsApi } from "../api/projects";
import { goalsApi } from "../api/goals";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useDialog } from "../context/DialogContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl, cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { Check, Download, Network, PanelTopOpen, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@stapleai/shared";
import { buildOrgSuggestionTemplates, type OrgSuggestionRole } from "../lib/org-suggestions";

// Layout constants
const CARD_W = 248;
const CARD_H = 124;
const GAP_X = 40;
const GAP_Y = 96;
const PADDING = 60;

// ── Tree layout types ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

type PreviewOrgNode = {
  id: string;
  name: string;
  role: string;
  status: string;
  reportsToRole: string | null;
  reports: PreviewOrgNode[];
};

// ── Layout algorithm ────────────────────────────────────────────────────

/** Compute the width each subtree needs. */
function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

/** Recursively assign x,y positions. */
function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    x: x + (totalW - CARD_W) / 2,
    y,
    children: layoutChildren,
  };
}

/** Layout all root nodes side by side. */
function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  const totalW = roots.reduce((sum, r) => sum + subtreeWidth(r), 0);
  const gaps = (roots.length - 1) * GAP_X;
  let x = PADDING;
  const y = PADDING;

  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, y));
    x += w + GAP_X;
  }

  // Compute bounds and return
  return result;
}

/** Flatten layout tree to list of nodes. */
function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Collect all parent→child edges. */
function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

function buildPreviewOrgTree(roles: OrgSuggestionRole[]): PreviewOrgNode[] {
  if (roles.length === 0) return [];
  const nodes: PreviewOrgNode[] = roles.map((role, index) => ({
    id: `preview-${index}-${role.role}-${role.name}`,
    name: role.name,
    role: role.role,
    status: "preview",
    reports: [],
    reportsToRole: role.reportsToRole ?? null,
  }));
  const byRole = new Map(nodes.map((node) => [node.role, node]));
  const roots: PreviewOrgNode[] = [];
  for (const node of nodes) {
    if (node.reportsToRole && byRole.get(node.reportsToRole)) {
      byRole.get(node.reportsToRole)!.reports.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ── Status dot colors (raw hex for SVG) ─────────────────────────────────

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  gemini_local: "Gemini",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
};

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};
const defaultDotColor = "#a3a3a3";

// ── Main component ──────────────────────────────────────────────────────

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openNewProject } = useDialog();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [goalId, setGoalId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [orgRequest, setOrgRequest] = useState("");
  const [orgDraft, setOrgDraft] = useState("");
  const [previewRoles, setPreviewRoles] = useState<OrgSuggestionRole[]>([]);
  const [controlsOpen, setControlsOpen] = useState(false);

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: goals = [] } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart" }]);
  }, [setBreadcrumbs]);

  const selectedProject = projectId
    ? projects.find((project) => project.id === projectId) ?? null
    : null;
  const selectedGoal = goalId
    ? goals.find((goal) => goal.id === goalId) ?? null
    : null;
  const orgTemplates = useMemo(
    () =>
      buildOrgSuggestionTemplates({
        agents: (agents ?? []).map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          title: agent.title,
        })),
        projectName: selectedProject?.name ?? null,
        goalTitle: selectedGoal?.title ?? null,
      }),
    [agents, selectedGoal?.title, selectedProject?.name],
  );
  const suggestedDraft = orgTemplates[0]?.prompt ?? "";
  const plannerPrompt = buildPlanningPrompt(orgRequest, orgDraft.trim() || rolesToSuggestionPrompt(previewRoles));
  const previewTree = useMemo(() => buildPreviewOrgTree(previewRoles), [previewRoles]);
  const hasPreview = previewRoles.length > 0;

  const suggestOrgMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a company first.");
      if (!orgRequest.trim()) throw new Error("Write the master prompt first.");
      return issuesApi.previewOrgSuggestion(selectedCompanyId, {
        prompt: orgRequest.trim(),
        projectId: projectId || null,
        goalId: goalId || null,
      });
    },
    onSuccess: (result) => {
      setOrgDraft(result.prompt);
      setPreviewRoles(
        result.roles.map((role) => ({
          ...role,
          reportsToRole: role.reportsToRole ?? undefined,
        })),
      );
      pushToast({
        title: "Suggested org ready",
        body: result.summary,
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Failed to suggest org",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const sendToAiMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a company first.");
      if (!plannerPrompt.trim()) throw new Error("Write the master prompt first.");
      const preview = await issuesApi.previewMasterPlan(selectedCompanyId, {
        prompt: plannerPrompt.trim(),
        projectId: projectId || null,
        goalId: goalId || null,
      });
      if (preview.issues.length === 0) {
        throw new Error("The AI plan did not produce any tasks.");
      }
      return issuesApi.applyMasterPlan(selectedCompanyId, {
        title: preview.title,
        summary: preview.summary,
        projectId: projectId || null,
        goalId: goalId || null,
        issues: preview.issues.map((issue) => ({
          ...issue,
          description: issue.description ?? null,
          assigneeAgentId: issue.assigneeAgentId ?? null,
        })),
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) }),
      ]);
      pushToast({
        title: "Sent to AI team",
        body: `Created ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} and queued the assigned agents.`,
        tone: "success",
      });
      setPreviewRoles([]);
      setOrgDraft("");
      setOrgRequest("");
      setControlsOpen(false);
      navigate("/dashboard");
    },
    onError: (error) => {
      pushToast({
        title: "Failed to send to AI team",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Select a project first.");
      return projectsApi.remove(projectId, selectedCompanyId || undefined);
    },
    onSuccess: async () => {
      const deletedId = projectId;
      setProjectId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) }),
      ]);
      pushToast({
        title: "Project deleted",
        body: deletedId ? "The selected project was removed." : "Project removed.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Failed to delete project",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  // Layout computation
  const chartTree = hasPreview ? previewTree : (orgTree ?? []);
  const layout = useMemo(() => layoutForest(chartTree as OrgNode[]), [chartTree]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);
  const chartSignature = useMemo(
    () => chartTree.map((node) => `${node.id}:${node.reports.length}`).join("|"),
    [chartTree],
  );

  // Compute SVG bounds
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Pan & zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Center the chart on first load
  const hasInitialized = useRef(false);
  useEffect(() => {
    hasInitialized.current = false;
  }, [chartSignature, hasPreview]);

  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    // Fit chart to container
    const scaleX = (containerW - 40) / bounds.width;
    const scaleY = (containerH - 40) / bounds.height;
    const baseZoom = Math.min(scaleX, scaleY, allNodes.length <= 6 ? 1.45 : 1);
    const fitZoom = Math.max(baseZoom, allNodes.length <= 6 ? 0.95 : 0.5);

    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;

    setZoom(fitZoom);
    setPan({
      x: (containerW - chartW) / 2,
      y: (containerH - chartH) / 2,
    });
  }, [allNodes, bounds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't drag if clicking a card
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);

    // Zoom toward mouse position
    const scale = newZoom / zoom;
    setPan({
      x: mouseX - scale * (mouseX - pan.x),
      y: mouseY - scale * (mouseY - pan.y),
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  useEffect(() => {
    function handleTabApproval(event: KeyboardEvent) {
      if (event.key !== "Tab" || !hasPreview) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        active?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      sendToAiMutation.mutate();
    }
    window.addEventListener("keydown", handleTabApproval);
    return () => window.removeEventListener("keydown", handleTabApproval);
  }, [hasPreview, sendToAiMutation]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        className="relative min-h-[720px] w-full flex-1 overflow-hidden rounded-xl border border-border bg-muted/20"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex justify-start">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/92 p-2 shadow-lg backdrop-blur">
          <Button variant="outline" size="sm" onClick={() => setControlsOpen((current) => !current)}>
            <PanelTopOpen className="mr-1.5 h-3.5 w-3.5" />
            {controlsOpen ? "Hide org actions" : "Org actions"}
          </Button>
          <Link to="/company/import">
            <Button variant="outline" size="sm">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import company
            </Button>
          </Link>
          <Link to="/company/export">
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export company
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={openNewProject}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New project
          </Button>
          <Button variant="outline" size="sm" onClick={openNewProject}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Connect Git
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/agents/new")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add root role
          </Button>
        </div>
      </div>
      {controlsOpen ? (
        <FlowchartOrgControls
          projects={projects}
          goals={goals}
          projectId={projectId}
          goalId={goalId}
          orgRequest={orgRequest}
          templates={orgTemplates}
          hasPreview={hasPreview}
          previewRoles={previewRoles}
          suggestOrgPending={suggestOrgMutation.isPending}
          sendToAiPending={sendToAiMutation.isPending}
          deleteProjectPending={deleteProjectMutation.isPending}
          onProjectChange={(value) => {
            setProjectId(value);
            setPreviewRoles([]);
            setOrgDraft("");
          }}
          onGoalChange={(value) => {
            setGoalId(value);
            setPreviewRoles([]);
            setOrgDraft("");
          }}
          onRequestChange={setOrgRequest}
          onUseTemplate={(template) => {
            setPreviewRoles(template.roles);
            setOrgDraft(template.prompt);
          }}
          onSuggestOrg={() => suggestOrgMutation.mutate()}
          onClearPreview={() => {
            setPreviewRoles([]);
            setOrgDraft("");
          }}
          onSendToAi={() => sendToAiMutation.mutate()}
          onAddRole={(role) => {
            navigate(buildNewAgentUrl(role));
          }}
          onClose={() => setControlsOpen(false)}
          onNewProject={openNewProject}
          onDeleteProject={() => {
            if (!projectId) return;
            if (window.confirm("Delete the selected project? This cannot be undone.")) {
              deleteProjectMutation.mutate();
            }
          }}
        />
      ) : null}
      {!hasPreview && allNodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div className="max-w-md rounded-2xl border border-dashed border-border bg-background/90 px-6 py-5 text-center shadow-sm backdrop-blur">
            <div className="text-base font-medium text-foreground">No org yet</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start with a template or give the CEO a master prompt. The suggested org will appear right here in the flowchart.
            </p>
          </div>
        </div>
      ) : null}
      {hasPreview ? (
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-md rounded-xl border border-cyan-400/30 bg-background/90 p-4 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                AI org suggestion preview
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The flowchart is showing the suggested team. Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">Tab</kbd> to send the request to the AI team.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use <span className="font-medium text-foreground">Send to AI team</span> to turn the prompt into issues and push them to assigned agents.
              </p>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                setPreviewRoles([]);
                setOrgDraft("");
              }}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
              <Button size="sm" onClick={() => sendToAiMutation.mutate()} disabled={sendToAiMutation.isPending}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {sendToAiMutation.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
          <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
            {previewRoles.map((role) => (
              <Button key={`${role.name}-${role.role}`} variant="outline" size="sm" onClick={() => navigate(buildNewAgentUrl(role))}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {role.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
          onClick={() => {
            const newZoom = Math.min(zoom * 1.4, 2.5);
            const container = containerRef.current;
            if (container) {
              const cx = container.clientWidth / 2;
              const cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
            }
            setZoom(newZoom);
          }}
          aria-label="Enlarge chart"
          title="Enlarge chart"
        >
          ⤢
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
          onClick={() => {
            const newZoom = Math.min(zoom * 1.2, 2);
            const container = containerRef.current;
            if (container) {
              const cx = container.clientWidth / 2;
              const cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
            }
            setZoom(newZoom);
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
          onClick={() => {
            const newZoom = Math.max(zoom * 0.8, 0.2);
            const container = containerRef.current;
            if (container) {
              const cx = container.clientWidth / 2;
              const cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
            }
            setZoom(newZoom);
          }}
          aria-label="Zoom out"
        >
          &minus;
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-[10px] hover:bg-accent transition-colors"
          onClick={() => {
            if (!containerRef.current) return;
            const cW = containerRef.current.clientWidth;
            const cH = containerRef.current.clientHeight;
            const scaleX = (cW - 40) / bounds.width;
            const scaleY = (cH - 40) / bounds.height;
            const fitZoom = Math.min(scaleX, scaleY, 1);
            const chartW = bounds.width * fitZoom;
            const chartH = bounds.height * fitZoom;
            setZoom(fitZoom);
            setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
          }}
          title="Fit to screen"
          aria-label="Fit chart to screen"
        >
          Fit
        </button>
      </div>

      {/* SVG layer for edges */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {edges.map(({ parent, child }) => {
            const x1 = parent.x + CARD_W / 2;
            const y1 = parent.y + CARD_H;
            const x2 = child.x + CARD_W / 2;
            const y2 = child.y;
            const midY = (y1 + y2) / 2;

            return (
              <path
                key={`${parent.id}-${child.id}`}
                d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      </svg>

      {/* Card layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {allNodes.map((node) => {
          const agent = agentMap.get(node.id);
          const dotColor = statusDotColor[node.status] ?? defaultDotColor;

          return (
            <div
              key={node.id}
              data-org-card
              className={cn(
                "absolute rounded-lg border shadow-sm transition-[box-shadow,border-color] duration-150 cursor-pointer select-none",
                hasPreview
                  ? "bg-card/90 border-cyan-400/40 shadow-cyan-500/10"
                  : "bg-card border-border hover:shadow-md hover:border-foreground/20",
              )}
              style={{
                left: node.x,
                top: node.y,
                width: CARD_W,
                minHeight: CARD_H,
              }}
              onClick={() => {
                if (hasPreview) return;
                navigate(agent ? agentUrl(agent) : `/agents/${node.id}`);
              }}
            >
              <div className="flex items-center px-4 py-3 gap-3">
                {/* Agent icon + status dot */}
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                    <AgentIcon icon={agent?.icon} className="h-4.5 w-4.5 text-foreground/70" />
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                    style={{ backgroundColor: dotColor }}
                  />
                </div>
                {/* Name + role + adapter type */}
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-sm font-semibold text-foreground leading-tight">
                    {node.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {agent?.title ?? roleLabel(node.role)}
                  </span>
                  {agent && !hasPreview ? (
                    <span className="text-[10px] text-muted-foreground/60 font-mono leading-tight mt-1">
                      {adapterLabels[agent.adapterType] ?? agent.adapterType}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center justify-end border-t border-border px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(buildNewAgentUrl({
                      name: hasPreview ? node.name : "New Report",
                      role: node.role,
                      title: agent?.title ?? roleLabel(node.role),
                      brief: hasPreview
                        ? previewRoles.find((role) => role.name === node.name && role.role === node.role)?.brief ?? `Create ${node.name} in the org.`
                        : `Create a new direct report under ${node.name} to support ${agent?.title ?? roleLabel(node.role)} responsibilities.`,
                      reportsToId: hasPreview ? undefined : node.id,
                    }));
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {hasPreview ? "Create role" : "Add report"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

const roleLabels: Record<string, string> = AGENT_ROLE_LABELS;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

function buildNewAgentUrl(role: {
  name: string;
  role: string;
  title: string;
  brief: string;
  reportsToId?: string;
}) {
  const params = new URLSearchParams();
  params.set("name", role.name);
  params.set("role", role.role);
  params.set("title", role.title);
  params.set("hireBrief", role.brief);
  if (role.reportsToId) params.set("reportsTo", role.reportsToId);
  return `/agents/new?${params.toString()}`;
}

function buildPlanningPrompt(orgRequest: string, orgDraft: string) {
  const request = orgRequest.trim();
  const draft = orgDraft.trim();
  if (request && draft) {
    return `${draft}\n\nMaster request:\n${request}`;
  }
  return draft || request;
}

function rolesToSuggestionPrompt(roles: OrgSuggestionRole[]) {
  if (roles.length === 0) return "";
  return [
    "Suggested org structure:",
    ...roles.map((role) =>
      `- ${role.name} | role=${role.role} | title=${role.title}${role.reportsToRole ? ` | reports_to_role=${role.reportsToRole}` : ""}`),
  ].join("\n");
}

function FlowchartOrgControls(props: {
  projects: Array<{ id: string; name: string }>;
  goals: Array<{ id: string; title: string }>;
  projectId: string;
  goalId: string;
  orgRequest: string;
  templates: Array<{ id: string; label: string; description: string; prompt: string; roles: OrgSuggestionRole[] }>;
  hasPreview: boolean;
  previewRoles: OrgSuggestionRole[];
  suggestOrgPending: boolean;
  sendToAiPending: boolean;
  deleteProjectPending: boolean;
  onProjectChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onRequestChange: (value: string) => void;
  onUseTemplate: (template: { id: string; label: string; description: string; prompt: string; roles: OrgSuggestionRole[] }) => void;
  onSuggestOrg: () => void;
  onClearPreview: () => void;
  onSendToAi: () => void;
  onAddRole: (role: OrgSuggestionRole) => void;
  onClose: () => void;
  onNewProject: () => void;
  onDeleteProject: () => void;
}) {
  const {
    projects,
    goals,
    projectId,
    goalId,
    orgRequest,
    templates,
    hasPreview,
    previewRoles,
    suggestOrgPending,
    sendToAiPending,
    deleteProjectPending,
    onProjectChange,
    onGoalChange,
    onRequestChange,
    onUseTemplate,
    onSuggestOrg,
    onClearPreview,
    onSendToAi,
    onAddRole,
    onClose,
    onNewProject,
    onDeleteProject,
  } = props;

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-20">
      <div className="pointer-events-auto rounded-2xl border border-border bg-background/92 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <div className="text-base font-semibold text-foreground">Org Flowchart</div>
              <p className="text-sm text-muted-foreground">
                Keep the chart as the main view. Prompt the CEO, get a suggested org, then send work to the team.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onSuggestOrg} disabled={!orgRequest.trim() || suggestOrgPending}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {suggestOrgPending ? "Thinking..." : "Suggest org"}
            </Button>
            <Button size="sm" onClick={onSendToAi} disabled={sendToAiPending || (!orgRequest.trim() && !hasPreview)}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {sendToAiPending ? "Sending..." : "Send to AI team"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Hide
            </Button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr),auto,auto]">
            <textarea
              className="min-h-24 w-full rounded-xl border border-border bg-background px-4 py-3 text-base leading-7 outline-none placeholder:text-muted-foreground/45"
              value={orgRequest}
              onChange={(event) => onRequestChange(event.target.value)}
              placeholder="Master prompt to CEO. Example: Build a polished launch, improve onboarding, wire analytics, and suggest the team that should execute it."
            />
            <select
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm xl:min-w-44"
              value={projectId}
              onChange={(event) => onProjectChange(event.target.value)}
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm xl:min-w-44"
              value={goalId}
              onChange={(event) => onGoalChange(event.target.value)}
            >
              <option value="">No goal</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.title}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onNewProject}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New project
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onNewProject}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Connect Git
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDeleteProject}
              disabled={!projectId || deleteProjectPending}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {deleteProjectPending ? "Deleting..." : "Delete project"}
            </Button>
            {hasPreview ? (
              <Button type="button" variant="outline" size="sm" onClick={onClearPreview}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear preview
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className="rounded-full border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent/40"
                onClick={() => onUseTemplate(template)}
              >
                <span className="block text-sm font-medium text-foreground">{template.label}</span>
              </button>
            ))}
            {previewRoles.length ? previewRoles.map((role) => (
              <Button key={`${role.name}-${role.role}`} variant="outline" size="sm" onClick={() => onAddRole(role)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {role.name}
              </Button>
            )) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
