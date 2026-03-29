import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApplyMasterPromptPlan, MasterPromptPlanPreviewResult } from "@stapleai/shared";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useToast } from "../context/ToastContext";
import { useNavigate } from "@/lib/router";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { goalsApi } from "../api/goals";
import { queryKeys } from "../lib/queryKeys";
import { buildOrgSuggestionTemplates } from "../lib/org-suggestions";
import { ChoosePathButton } from "./PathInstructionsModal";
import { Button } from "@/components/ui/button";
import { Bot, Expand, FolderPlus, Minimize2, Sparkles, Wand2, X } from "lucide-react";

function defaultPlanState(): ApplyMasterPromptPlan {
  return {
    title: "",
    summary: "",
    projectId: null,
    goalId: null,
    issues: [],
  };
}

function isAbsolutePath(value: string) {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

function deriveWorkspaceNameFromPath(value: string) {
  const normalized = value.trim().replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? "Local folder";
}

export function MasterPromptPlannerDialog() {
  const { selectedCompanyId } = useCompany();
  const { masterPlannerOpen, masterPlannerDefaults, closeMasterPlanner } = useDialog();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [plan, setPlan] = useState<ApplyMasterPromptPlan>(defaultPlanState());
  const [planSource, setPlanSource] = useState<MasterPromptPlanPreviewResult["source"] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [promptWorkspaceOpen, setPromptWorkspaceOpen] = useState(false);
  const [createLocalProject, setCreateLocalProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectFolder, setNewProjectFolder] = useState("");
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const promptWorkspaceRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && masterPlannerOpen,
  });

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && masterPlannerOpen,
  });

  const { data: goals = [] } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && masterPlannerOpen,
  });

  const selectedProjectName = projectId
    ? projects.find((project) => project.id === projectId)?.name ?? null
    : null;
  const selectedGoalTitle = goalId
    ? goals.find((goal) => goal.id === goalId)?.title ?? null
    : null;
  const orgTemplates = useMemo(
    () =>
      buildOrgSuggestionTemplates({
        agents,
        projectName: selectedProjectName,
        goalTitle: selectedGoalTitle,
      }),
    [agents, selectedGoalTitle, selectedProjectName],
  );
  const suggestedOrgStructure = orgTemplates[0]?.prompt ?? "";

  useEffect(() => {
    if (!masterPlannerOpen) {
      setPrompt("");
      setProjectId("");
      setGoalId("");
      setPlan(defaultPlanState());
      setPlanSource(null);
      setWarnings([]);
      setReasoning([]);
      setPromptWorkspaceOpen(false);
      setCreateLocalProject(false);
      setNewProjectName("");
      setNewProjectFolder("");
      return;
    }
    setPrompt(masterPlannerDefaults.prompt ?? "");
    setProjectId(masterPlannerDefaults.projectId ?? "");
    setGoalId(masterPlannerDefaults.goalId ?? "");
  }, [masterPlannerDefaults.goalId, masterPlannerDefaults.projectId, masterPlannerDefaults.prompt, masterPlannerOpen]);

  useEffect(() => {
    if (!promptWorkspaceOpen) return;
    const id = window.requestAnimationFrame(() => {
      promptWorkspaceRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [promptWorkspaceOpen]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a company first.");
      if (!prompt.trim()) throw new Error("Enter a master prompt first.");
      return issuesApi.previewMasterPlan(selectedCompanyId, {
        prompt: prompt.trim(),
        projectId: projectId || null,
        goalId: goalId || null,
      });
    },
    onSuccess: (preview) => {
      setPlan({
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
      setPlanSource(preview.source);
      setWarnings(preview.warnings);
      setReasoning(preview.reasoning);
    },
    onError: (error) => {
      pushToast({
        title: "Failed to generate plan",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a company first.");
      if (!plan.title.trim()) throw new Error("Plan title is required.");
      if (plan.issues.length === 0) throw new Error("Generate a plan before applying it.");
      let effectiveProjectId = projectId || null;

      if (createLocalProject) {
        const folder = newProjectFolder.trim();
        if (!folder) throw new Error("Enter a local project folder.");
        if (!isAbsolutePath(folder)) throw new Error("Local project folder must be a full absolute path.");

        const createdProject = await projectsApi.create(selectedCompanyId, {
          name: newProjectName.trim() || plan.title.trim(),
          description: plan.summary.trim() || undefined,
          status: "planned",
          ...(goalId ? { goalIds: [goalId] } : {}),
          workspace: {
            name: deriveWorkspaceNameFromPath(folder),
            cwd: folder,
            sourceType: "local_path",
            isPrimary: true,
          },
        });

        effectiveProjectId = createdProject.id;
      }

      return issuesApi.applyMasterPlan(selectedCompanyId, {
        ...plan,
        title: plan.title.trim(),
        summary: plan.summary.trim(),
        projectId: effectiveProjectId,
        goalId: goalId || null,
        issues: plan.issues.map((issue) => ({
          ...issue,
          title: issue.title.trim(),
          description: issue.description?.trim() || null,
          assigneeAgentId: issue.assigneeAgentId ?? null,
        })),
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.activity(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId!) });
      pushToast({
        title: "Plan applied",
        body: `Created ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}.`,
        tone: "success",
      });
      closeMasterPlanner();
      navigate("/dashboard");
    },
    onError: (error) => {
      pushToast({
        title: "Failed to apply plan",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  function updateIssue(index: number, patch: Partial<ApplyMasterPromptPlan["issues"][number]>) {
    setPlan((current) => ({
      ...current,
      issues: current.issues.map((issue, issueIndex) => issueIndex === index ? { ...issue, ...patch } : issue),
    }));
  }

  function removeIssue(index: number) {
    setPlan((current) => ({
      ...current,
      issues: current.issues.filter((_, issueIndex) => issueIndex !== index),
    }));
  }

  function insertSuggestedOrgStructure() {
    const inserted = `${suggestedOrgStructure}\n`;
    setPrompt((current) => current.length === 0 ? inserted : `${inserted}${current}`);
    window.requestAnimationFrame(() => {
      const el = promptRef.current;
      if (!el) return;
      const cursor = inserted.length;
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  useEffect(() => {
    if (!masterPlannerOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMasterPlanner();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMasterPlanner, masterPlannerOpen]);

  if (!masterPlannerOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[85]">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close planner"
        onClick={closeMasterPlanner}
      />
      <div className="absolute inset-4 z-[90] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Plan With AI</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Turn one master prompt into a readable execution plan, then create the issues for your team.
            </p>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={closeMasterPlanner}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-[calc(100%-81px)] overflow-y-auto">
        <div className="grid gap-0 lg:grid-cols-[1.08fr,0.92fr]">
          <div className="border-b border-border p-6 lg:border-b-0 lg:border-r">
            {!selectedCompanyId ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                Select a company before planning work.
              </div>
            ) : null}
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Step 1</div>
                  <label className="mt-1 block text-lg font-semibold text-foreground">Master prompt</label>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Write the full request you want the team to execute.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] gap-2"
                  onClick={() => setPromptWorkspaceOpen((current) => !current)}
                >
                  {promptWorkspaceOpen ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                  {promptWorkspaceOpen ? "Collapse" : "Expand"}
                </Button>
              </div>
              <div className="relative">
                {prompt.length === 0 && (
                  <button
                    type="button"
                    className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-start rounded-xl border border-dashed border-border/70 bg-background/75 px-4 py-3 text-left"
                    onClick={insertSuggestedOrgStructure}
                  >
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Press Tab to insert
                    </span>
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground/60">
                      {suggestedOrgStructure}
                    </pre>
                  </button>
                )}
                <textarea
                  ref={promptRef}
                  className="relative min-h-56 w-full rounded-xl border border-border bg-background px-4 py-3 text-base leading-7 outline-none placeholder:text-muted-foreground/40"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && prompt.length === 0) {
                      e.preventDefault();
                      insertSuggestedOrgStructure();
                    }
                  }}
                  placeholder="Example: Launch a polished marketing site for Staple, add onboarding improvements, wire analytics, and prepare a launch checklist. Split work across the team."
                />
              </div>
              {orgTemplates.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">Suggested orgs</span>
                    <span className="text-sm text-muted-foreground">Use one as the starting point</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {orgTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className="rounded-xl border border-border bg-muted/20 px-4 py-4 text-left transition-colors hover:bg-accent/40"
                        onClick={() => setPrompt(template.prompt)}
                      >
                        <div className="text-base font-medium text-foreground">{template.label}</div>
                        <div className="mt-1 text-sm leading-6 text-muted-foreground">{template.description}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <span>{prompt.trim() ? `${prompt.trim().split(/\s+/).length} words` : "No prompt yet"}</span>
                <span>{prompt.length} characters</span>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3">
              <div className="text-sm font-medium text-foreground">Step 2</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Add project and goal context so the plan lines up with the right workstream.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Project</label>
                <select
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={createLocalProject}
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Goal</label>
                <select
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                >
                  <option value="">No goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>{goal.title}</option>
                  ))}
                </select>
              </div>
            </div>
            </section>

            <section className="rounded-2xl border border-border bg-card px-4 py-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <FolderPlus className="h-4 w-4" />
                    New local project workspace
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Optionally create a new project and attach a local folder before applying the plan.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={createLocalProject ? "secondary" : "outline"}
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => setCreateLocalProject((current) => !current)}
                >
                  {createLocalProject ? "Enabled" : "Optional"}
                </Button>
              </div>

              {createLocalProject ? (
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Project name</label>
                    <input
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder={plan.title || "Project name"}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Local folder</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono outline-none"
                        value={newProjectFolder}
                        onChange={(e) => setNewProjectFolder(e.target.value)}
                        placeholder="/absolute/path/to/project"
                      />
                      <ChoosePathButton />
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      The planner will create the project first, set this folder as its primary workspace, then create the generated issues inside it.
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Bot className="h-4 w-4" />
                Agent roster
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                {agents.length === 0 && <p>No agents available for assignment.</p>}
                {agents.map((agent) => (
                  <p key={agent.id}>
                    {agent.name} · {agent.role}{agent.title ? ` · ${agent.title}` : ""}
                  </p>
                ))}
              </div>
            </section>

            <div className="flex items-center justify-end">
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={!prompt.trim() || previewMutation.isPending}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {previewMutation.isPending ? "Planning…" : "Generate Plan"}
              </Button>
            </div>
          </div>

          <div className="p-6">
            {plan.issues.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-6 py-8 text-sm leading-6 text-muted-foreground">
                Generate a plan to preview the task split, assignments, and execution notes before you create the issues.
              </div>
            ) : (
              <>
                <section className="rounded-2xl border border-border bg-card p-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Step 3</div>
                  <label className="text-sm font-medium text-foreground">Plan title</label>
                  <input
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
                    value={plan.title}
                    onChange={(e) => setPlan((current) => ({ ...current, title: e.target.value }))}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  <label className="text-sm font-medium text-foreground">Summary</label>
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none"
                    value={plan.summary}
                    onChange={(e) => setPlan((current) => ({ ...current, summary: e.target.value }))}
                  />
                </div>
                </section>

                {(reasoning.length > 0 || warnings.length > 0 || planSource) && (
                  <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-4 text-sm">
                    {planSource && <p className="font-medium text-foreground">Plan source: {planSource === "openai" ? "OpenAI" : "Heuristic"}</p>}
                    {reasoning.length > 0 && (
                      <div className="mt-3">
                        <p className="font-medium text-foreground">Why this split</p>
                        {reasoning.map((item) => <p key={item} className="mt-1 text-sm leading-6 text-muted-foreground">{item}</p>)}
                      </div>
                    )}
                    {warnings.length > 0 && (
                      <div className="mt-3">
                        <p className="font-medium text-foreground">Warnings</p>
                        {warnings.map((item) => <p key={item} className="mt-1 text-sm leading-6 text-muted-foreground">{item}</p>)}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {plan.issues.map((issue, index) => (
                    <article key={`${index}-${issue.title}`} className="rounded-2xl border border-border bg-card px-4 py-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">Task {index + 1}</span>
                        <button
                          className="text-sm text-muted-foreground hover:text-foreground"
                          onClick={() => removeIssue(index)}
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
                        value={issue.title}
                        onChange={(e) => updateIssue(index, { title: e.target.value })}
                      />
                      <textarea
                        className="min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none"
                        value={issue.description ?? ""}
                        onChange={(e) => updateIssue(index, { description: e.target.value })}
                      />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <select
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          value={issue.assigneeAgentId ?? ""}
                          onChange={(e) => updateIssue(index, { assigneeAgentId: e.target.value || null })}
                        >
                          <option value="">Unassigned</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>{agent.name}</option>
                          ))}
                        </select>
                        <select
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          value={issue.priority}
                          onChange={(e) => updateIssue(index, { priority: e.target.value as ApplyMasterPromptPlan["issues"][number]["priority"] })}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                        <select
                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                          value={issue.status}
                          onChange={(e) => updateIssue(index, { status: e.target.value as ApplyMasterPromptPlan["issues"][number]["status"] })}
                        >
                          <option value="backlog">Backlog</option>
                          <option value="todo">Todo</option>
                          <option value="in_progress">In Progress</option>
                        </select>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={closeMasterPlanner}>Cancel</Button>
                  <Button onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending || plan.issues.length === 0}>
                    <Wand2 className="mr-1.5 h-4 w-4" />
                    {applyMutation.isPending ? "Creating…" : "Create Issues"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        </div>

        {promptWorkspaceOpen ? (
          <div className="absolute inset-y-0 right-0 z-30 w-full border-l border-border bg-background/96 backdrop-blur-sm md:w-[44rem]">
            <aside className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h3 className="text-sm font-medium">Prompt Workspace</h3>
                  <p className="text-xs text-muted-foreground">
                    Expand the master request, inspect it clearly, and edit it before planning.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setPromptWorkspaceOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1.2fr,0.8fr]">
                <section className="flex min-h-0 flex-col border-b border-border p-4 md:border-b-0 md:border-r">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Full Prompt
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {prompt.trim() ? `${prompt.trim().split(/\s+/).length} words` : "0 words"} · {prompt.length} chars
                    </div>
                  </div>
                  <textarea
                    ref={promptWorkspaceRef}
                    className="min-h-0 flex-1 resize-none rounded-md border border-border bg-background px-4 py-3 text-base leading-7 outline-none placeholder:text-muted-foreground/40"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Write the full master request here before generating the plan."
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={insertSuggestedOrgStructure}>
                      Insert suggested org
                    </Button>
                    <Button
                      type="button"
                      onClick={() => previewMutation.mutate()}
                      disabled={!prompt.trim() || previewMutation.isPending}
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" />
                      {previewMutation.isPending ? "Planning…" : "Generate Plan"}
                    </Button>
                  </div>
                </section>

                <aside className="flex min-h-0 flex-col p-4">
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Prompt Preview
                  </div>
                  <div className="mt-2 min-h-0 flex-1 rounded-md border border-border bg-muted/20 px-4 py-3">
                    {prompt.trim() ? (
                      <pre className="h-full overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                        {prompt}
                      </pre>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Your master prompt preview will appear here.
                      </div>
                    )}
                  </div>
                  <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                    The planner will split this request into issues, assign likely owners, and preserve the selected project and goal.
                  </div>
                </aside>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
