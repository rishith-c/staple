import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { companySkillsApi } from "../api/companySkills";
import { queryKeys } from "../lib/queryKeys";
import { AGENT_ROLES } from "@stapleai/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Shield, Sparkles } from "lucide-react";
import { cn, agentUrl } from "../lib/utils";
import { roleLabels } from "../components/agent-config-primitives";
import { AgentConfigForm, type CreateConfigValues } from "../components/AgentConfigForm";
import { defaultCreateValues } from "../components/agent-config-defaults";
import { getUIAdapter } from "../adapters";
import { ReportsToPicker } from "../components/ReportsToPicker";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@stapleai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@stapleai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@stapleai/adapter-gemini-local";

const SUPPORTED_ADVANCED_ADAPTER_TYPES = new Set<CreateConfigValues["adapterType"]>([
  "claude_local",
  "codex_local",
  "gemini_local",
  "opencode_local",
  "pi_local",
  "cursor",
  "openclaw_gateway",
]);

function createValuesForAdapterType(
  adapterType: CreateConfigValues["adapterType"],
): CreateConfigValues {
  const { adapterType: _discard, ...defaults } = defaultCreateValues;
  const nextValues: CreateConfigValues = { ...defaults, adapterType };
  if (adapterType === "codex_local") {
    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
    nextValues.dangerouslyBypassSandbox =
      DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
  } else if (adapterType === "gemini_local") {
    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
  } else if (adapterType === "cursor") {
    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
  } else if (adapterType === "opencode_local") {
    nextValues.model = "";
  }
  return nextValues;
}

export function NewAgent() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetAdapterType = searchParams.get("adapterType");
  const presetReportsTo = searchParams.get("reportsTo");
  const presetRole = searchParams.get("role");
  const presetTitle = searchParams.get("title");
  const presetName = searchParams.get("name");
  const presetHireBrief = searchParams.get("hireBrief");

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("general");
  const [capabilities, setCapabilities] = useState("");
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<CreateConfigValues>(defaultCreateValues);
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [hireBrief, setHireBrief] = useState("");
  const [suggestionNotes, setSuggestionNotes] = useState<string[]>([]);
  const [suggestionWarnings, setSuggestionWarnings] = useState<string[]>([]);
  const [suggestionSource, setSuggestionSource] = useState<"openai" | "heuristic" | null>(null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.adapterModels(selectedCompanyId, configValues.adapterType)
      : ["agents", "none", "adapter-models", configValues.adapterType],
    queryFn: () => agentsApi.adapterModels(selectedCompanyId!, configValues.adapterType),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: companySkills } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId ?? ""),
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const isFirstAgent = !agents || agents.length === 0;
  const effectiveRole = isFirstAgent ? "ceo" : role;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Agents", href: "/agents" },
      { label: "New Agent" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (isFirstAgent) {
      if (!name) setName("CEO");
      if (!title) setTitle("CEO");
    }
  }, [isFirstAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const requested = presetAdapterType;
    if (!requested) return;
    if (!SUPPORTED_ADVANCED_ADAPTER_TYPES.has(requested as CreateConfigValues["adapterType"])) {
      return;
    }
    setConfigValues((prev) => {
      if (prev.adapterType === requested) return prev;
      return createValuesForAdapterType(requested as CreateConfigValues["adapterType"]);
    });
  }, [presetAdapterType]);

  useEffect(() => {
    if (!presetName) return;
    setName((current) => current || presetName);
  }, [presetName]);

  useEffect(() => {
    if (!presetTitle) return;
    setTitle((current) => current || presetTitle);
  }, [presetTitle]);

  useEffect(() => {
    if (!presetHireBrief) return;
    setHireBrief((current) => current || presetHireBrief);
  }, [presetHireBrief]);

  useEffect(() => {
    if (!presetReportsTo || isFirstAgent) return;
    setReportsTo((current) => current ?? presetReportsTo);
  }, [isFirstAgent, presetReportsTo]);

  useEffect(() => {
    if (!presetRole || isFirstAgent) return;
    if (!AGENT_ROLES.includes(presetRole as (typeof AGENT_ROLES)[number])) return;
    setRole(presetRole);
  }, [isFirstAgent, presetRole]);

  const createAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      agentsApi.hire(selectedCompanyId!, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(agentUrl(result.agent));
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Failed to create agent");
    },
  });

  const suggestAgentConfiguration = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Select a company first.");
      if (!hireBrief.trim()) throw new Error("Describe the hire first.");
      return agentsApi.suggestConfiguration(selectedCompanyId, hireBrief.trim());
    },
    onSuccess: (suggestion) => {
      setFormError(null);
      setName((current) => current.trim() || suggestion.name);
      setTitle(suggestion.title);
      setRole(suggestion.role);
      setCapabilities(suggestion.capabilities);
      setSuggestionNotes(suggestion.reasoning);
      setSuggestionWarnings(suggestion.warnings);
      setSuggestionSource(suggestion.source);
      setConfigValues((prev) => {
        const next = createValuesForAdapterType(suggestion.adapterType);
        return {
          ...next,
          model: suggestion.model || next.model,
          promptTemplate: suggestion.promptTemplate,
          heartbeatEnabled: suggestion.heartbeatEnabled,
          intervalSec: suggestion.intervalSec,
          envBindings: prev.envBindings,
        };
      });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Failed to draft agent configuration");
    },
  });

  function buildAdapterConfig() {
    const adapter = getUIAdapter(configValues.adapterType);
    return adapter.buildAdapterConfig(configValues);
  }

  function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    setFormError(null);
    if (configValues.adapterType === "opencode_local") {
      const selectedModel = configValues.model.trim();
      if (!selectedModel) {
        setFormError("OpenCode requires an explicit model in provider/model format.");
        return;
      }
      if (adapterModelsError) {
        setFormError(
          adapterModelsError instanceof Error
            ? adapterModelsError.message
            : "Failed to load OpenCode models.",
        );
        return;
      }
      if (adapterModelsLoading || adapterModelsFetching) {
        setFormError("OpenCode models are still loading. Please wait and try again.");
        return;
      }
      const discovered = adapterModels ?? [];
      if (!discovered.some((entry) => entry.id === selectedModel)) {
        setFormError(
          discovered.length === 0
            ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
            : `Configured OpenCode model is unavailable: ${selectedModel}`,
        );
        return;
      }
    }
    createAgent.mutate({
      name: name.trim(),
      role: effectiveRole,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(capabilities.trim() ? { capabilities: capabilities.trim() } : {}),
      ...(reportsTo ? { reportsTo } : {}),
      ...(selectedSkillKeys.length > 0 ? { desiredSkills: selectedSkillKeys } : {}),
      adapterType: configValues.adapterType,
      adapterConfig: buildAdapterConfig(),
      runtimeConfig: {
        heartbeat: {
          enabled: configValues.heartbeatEnabled,
          intervalSec: configValues.intervalSec,
          wakeOnDemand: true,
          cooldownSec: 10,
          maxConcurrentRuns: 1,
        },
      },
      budgetMonthlyCents: 0,
    });
  }

  const availableSkills = (companySkills ?? []).filter((skill) => !skill.key.startsWith("stapleai/staple/"));

  function toggleSkill(key: string, checked: boolean) {
    setSelectedSkillKeys((prev) => {
      if (checked) {
        return prev.includes(key) ? prev : [...prev, key];
      }
      return prev.filter((value) => value !== key);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">New Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Advanced agent configuration
        </p>
      </div>

      <div className="border border-border">
        <div className="border-b border-border px-4 py-4 space-y-3 bg-muted/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">AI hire draft</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Describe the employee you want, like “engineering intern for bug fixes” or
                “senior frontend developer who can lead features.”
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!hireBrief.trim() || suggestAgentConfiguration.isPending}
              onClick={() => suggestAgentConfiguration.mutate()}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {suggestAgentConfiguration.isPending ? "Drafting…" : "Draft with AI"}
            </Button>
          </div>
          <textarea
            className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/40"
            placeholder="Example: Hire a senior backend developer who can own APIs, review code, mentor junior engineers, and work mostly in TypeScript."
            value={hireBrief}
            onChange={(e) => setHireBrief(e.target.value)}
          />
          {(suggestionNotes.length > 0 || suggestionWarnings.length > 0) && (
            <div className="space-y-2 rounded-md border border-border bg-background px-3 py-3">
              <p className="text-xs font-medium text-foreground">
                Draft source: {suggestionSource === "openai" ? "OpenAI" : "Built-in heuristic"}
              </p>
              {suggestionNotes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Why this config</p>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {suggestionNotes.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                </div>
              )}
              {suggestionWarnings.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Review before create</p>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {suggestionWarnings.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Name */}
        <div className="px-4 pt-4 pb-2">
          <input
            className="w-full text-lg font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50"
            placeholder="Agent name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* Title */}
        <div className="px-4 pb-2">
          <input
            className="w-full bg-transparent outline-none text-sm text-muted-foreground placeholder:text-muted-foreground/40"
            placeholder="Title (e.g. VP of Engineering)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="px-4 pb-3">
          <textarea
            className="min-h-20 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/40"
            placeholder="Capabilities and expectations for this hire"
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
          />
        </div>

        {/* Property chips: Role + Reports To */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border flex-wrap">
          <Popover open={roleOpen} onOpenChange={setRoleOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors",
                  isFirstAgent && "opacity-60 cursor-not-allowed"
                )}
                disabled={isFirstAgent}
              >
                <Shield className="h-3 w-3 text-muted-foreground" />
                {roleLabels[effectiveRole] ?? effectiveRole}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="start">
              {AGENT_ROLES.map((r) => (
                <button
                  key={r}
                  className={cn(
                    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                    r === role && "bg-accent"
                  )}
                  onClick={() => { setRole(r); setRoleOpen(false); }}
                >
                  {roleLabels[r] ?? r}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <ReportsToPicker
            agents={agents ?? []}
            value={reportsTo}
            onChange={setReportsTo}
            disabled={isFirstAgent}
          />
        </div>

        {/* Shared config form */}
        <AgentConfigForm
          mode="create"
          values={configValues}
          onChange={(patch) => setConfigValues((prev) => ({ ...prev, ...patch }))}
          adapterModels={adapterModels}
        />

        <div className="border-t border-border px-4 py-4">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-medium">Company skills</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional skills from the company library. Built-in Staple runtime skills are added automatically.
              </p>
            </div>
            {availableSkills.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No optional company skills installed yet.
              </p>
            ) : (
              <div className="space-y-3">
                {availableSkills.map((skill) => {
                  const inputId = `skill-${skill.id}`;
                  const checked = selectedSkillKeys.includes(skill.key);
                  return (
                    <div key={skill.id} className="flex items-start gap-3">
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(next) => toggleSkill(skill.key, next === true)}
                      />
                      <label htmlFor={inputId} className="grid gap-1 leading-none">
                        <span className="text-sm font-medium">{skill.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {skill.description ?? skill.key}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          {isFirstAgent && (
            <p className="text-xs text-muted-foreground mb-2">This will be the CEO</p>
          )}
          {formError && (
            <p className="text-xs text-destructive mb-2">{formError}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/agents")}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!name.trim() || createAgent.isPending}
              onClick={handleSubmit}
            >
              {createAgent.isPending ? "Creating…" : "Create agent"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
