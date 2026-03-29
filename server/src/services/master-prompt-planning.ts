import type {
  ApplyMasterPromptPlan,
  MasterPromptPlanPreviewResult,
  OrgSuggestionPreviewResult,
} from "@stapleai/shared";
import {
  masterPromptPlanPreviewResultSchema,
  orgSuggestionPreviewResultSchema,
} from "@stapleai/shared";
import { readConfigFile } from "../config-file.js";

type PlannerAgent = {
  id: string;
  name: string;
  role: string;
  title: string | null;
  capabilities: string | null;
  status: string;
};

type PlannerContext = {
  projectName?: string | null;
  projectDescription?: string | null;
  goalTitle?: string | null;
  goalDescription?: string | null;
};

type OrgSuggestionRoleDraft = {
  name: string;
  role: string;
  title: string;
  reportsToRole?: string | null;
  brief: string;
};

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveOpenAiApiKey(): string | null {
  const envKey = nonEmpty(process.env.OPENAI_API_KEY);
  if (envKey) return envKey;
  const config = readConfigFile();
  if (config?.llm?.provider === "openai") {
    return nonEmpty(config.llm.apiKey);
  }
  return null;
}

function summarizePrompt(prompt: string) {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 120) return singleLine;
  return `${singleLine.slice(0, 117)}...`;
}

function splitPromptIntoTasks(prompt: string): string[] {
  const bulletLines = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*•]|\d+\./.test(line))
    .map((line) => line.replace(/^([-*•]|\d+\.)\s*/, "").trim())
    .filter(Boolean);
  if (bulletLines.length >= 2) {
    return bulletLines.slice(0, 8);
  }

  const paragraphParts = prompt
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphParts.length >= 2) {
    return paragraphParts.slice(0, 6);
  }

  const sentenceParts = prompt
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentenceParts.length >= 2) {
    return sentenceParts.slice(0, 6);
  }

  const andParts = prompt
    .split(/\s+(?:and|then|after that)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return (andParts.length >= 2 ? andParts : [prompt.trim()]).slice(0, 6);
}

function inferPriority(text: string): "low" | "medium" | "high" | "critical" {
  const lower = text.toLowerCase();
  if (/\b(urgent|critical|blocker|p0|sev1)\b/.test(lower)) return "critical";
  if (/\b(high priority|important|asap|launch|ship)\b/.test(lower)) return "high";
  if (/\b(nice to have|optional|later|polish)\b/.test(lower)) return "low";
  return "medium";
}

function scoreAgentForTask(agent: PlannerAgent, task: string): number {
  const lower = task.toLowerCase();
  const role = agent.role.toLowerCase();
  const capabilityText = `${agent.title ?? ""} ${agent.capabilities ?? ""}`.toLowerCase();
  let score = 0;

  const grant = (matches: boolean, points: number) => {
    if (matches) score += points;
  };

  grant(role === "engineer" && /(build|implement|code|fix|api|frontend|backend|feature|bug|refactor|test)/.test(lower), 6);
  grant(role === "designer" && /(design|ui|ux|layout|flow|visual|brand)/.test(lower), 6);
  grant(role === "researcher" && /(research|investigate|compare|analyze|benchmark|market)/.test(lower), 6);
  grant(role === "qa" && /(test|qa|verify|regression|reproduce|bug bash)/.test(lower), 6);
  grant(role === "pm" && /(plan|scope|spec|prioritize|roadmap|requirements)/.test(lower), 6);
  grant(role === "devops" && /(deploy|infra|ci|cd|ops|monitor|docker|kubernetes)/.test(lower), 6);
  grant(role === "cto" && /(architecture|system design|hiring|staffing|technical direction)/.test(lower), 5);

  const keywordMatches = Array.from(new Set(lower.match(/[a-z]{4,}/g) ?? []))
    .filter((word) => capabilityText.includes(word))
    .length;
  score += Math.min(keywordMatches, 4);

  if (agent.status === "paused" || agent.status === "error" || agent.status === "terminated") {
    score -= 100;
  }

  return score;
}

function assignAgent(agents: PlannerAgent[], task: string): string | null {
  const ranked = agents
    .map((agent) => ({ agent, score: scoreAgentForTask(agent, task) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score <= 0) return null;
  return ranked[0].agent.id;
}

function buildPlanningPrompt(prompt: string, context?: PlannerContext) {
  const contextLines = [
    context?.projectName ? `Project: ${context.projectName}` : null,
    context?.projectDescription ? `Project description: ${context.projectDescription}` : null,
    context?.goalTitle ? `Goal: ${context.goalTitle}` : null,
    context?.goalDescription ? `Goal description: ${context.goalDescription}` : null,
  ].filter((value): value is string => Boolean(value));

  if (contextLines.length === 0) return prompt.trim();
  return `${contextLines.join("\n")}\n\nMaster request:\n${prompt.trim()}`;
}

function buildOrgPrompt(prompt: string, roles: OrgSuggestionRoleDraft[], context?: PlannerContext) {
  return [
    "Suggested org structure:",
    ...roles.map((role) =>
      `- ${role.name} | role=${role.role} | title=${role.title}${role.reportsToRole ? ` | reports_to_role=${role.reportsToRole}` : ""}`),
    "",
    buildPlanningPrompt(prompt, context),
  ].join("\n");
}

function buildHeuristicOrgSuggestion(prompt: string, context?: PlannerContext): OrgSuggestionPreviewResult {
  const lower = prompt.toLowerCase();
  const roles: OrgSuggestionRoleDraft[] = [
    {
      name: "CEO",
      role: "ceo",
      title: "Chief Executive Officer",
      brief: "Own strategy, sequencing, tradeoffs, and cross-team coordination.",
    },
    {
      name: "CTO",
      role: "cto",
      title: "Chief Technology Officer",
      reportsToRole: "ceo",
      brief: "Own architecture, engineering quality, staffing, and execution breakdown.",
    },
  ];

  if (/(design|ui|ux|brand|landing page|frontend)/.test(lower)) {
    roles.push({
      name: "Product Designer",
      role: "designer",
      title: "Product Designer",
      reportsToRole: "ceo",
      brief: "Own flows, interface direction, visual polish, and implementation-ready specs.",
    });
  }
  if (/(frontend|react|ui|web|landing page)/.test(lower)) {
    roles.push({
      name: "Frontend Engineer",
      role: "engineer",
      title: "Frontend Engineer",
      reportsToRole: "cto",
      brief: "Implement frontend features, interactions, and production UI details.",
    });
  }
  if (/(backend|api|database|integration|auth|server)/.test(lower)) {
    roles.push({
      name: "Backend Engineer",
      role: "engineer",
      title: "Backend Engineer",
      reportsToRole: "cto",
      brief: "Build APIs, persistence, backend integrations, and operational logic.",
    });
  }
  if (/(qa|test|verify|regression|bug)/.test(lower)) {
    roles.push({
      name: "QA Engineer",
      role: "qa",
      title: "QA Engineer",
      reportsToRole: "cto",
      brief: "Own test plans, regression checks, and release confidence.",
    });
  }
  if (/(ops|deploy|infra|infrastructure|ci|cd|monitor)/.test(lower)) {
    roles.push({
      name: "DevOps Engineer",
      role: "devops",
      title: "DevOps Engineer",
      reportsToRole: "cto",
      brief: "Own deployment, CI, runtime environments, and operational reliability.",
    });
  }
  if (/(product|roadmap|priorit|spec|requirements)/.test(lower)) {
    roles.push({
      name: "Product Manager",
      role: "pm",
      title: "Product Manager",
      reportsToRole: "ceo",
      brief: "Own scope, sequencing, specs, and product coordination.",
    });
  }

  if (roles.length === 2) {
    roles.push({
      name: "Senior Engineer",
      role: "engineer",
      title: "Senior Engineer",
      reportsToRole: "cto",
      brief: "Ship implementation work, break down tasks, and maintain delivery momentum.",
    });
  }

  const summaryParts = [
    context?.projectName ? `project ${context.projectName}` : null,
    context?.goalTitle ? `goal ${context.goalTitle}` : null,
  ].filter((value): value is string => Boolean(value));

  return orgSuggestionPreviewResultSchema.parse({
    label: "Suggested org",
    summary:
      summaryParts.length > 0
        ? `Built an org suggestion for ${summaryParts.join(" and ")} using the master request.`
        : "Built an org suggestion from the master request.",
    prompt: buildOrgPrompt(prompt, roles, context),
    roles,
    warnings: [
      "Review reporting lines before creating roles.",
      "This suggestion is a starting point and may need company-specific adjustments.",
    ],
    reasoning: [
      "Detected product, engineering, design, and QA needs from the request keywords.",
      "Started with CEO and CTO, then added execution roles where the prompt implied ownership.",
    ],
    source: "heuristic",
  });
}

async function buildOpenAiOrgSuggestion(prompt: string, context?: PlannerContext): Promise<OrgSuggestionPreviewResult> {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    return buildHeuristicOrgSuggestion(prompt, context);
  }
  const planningPrompt = buildPlanningPrompt(prompt, context);
  const model = nonEmpty(process.env.STAPLE_MASTER_PLAN_MODEL) ?? "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You design practical org structures for an AI company. Return a small, concrete org that can execute the request, with clear reporting lines and role briefs.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Master request:\n${planningPrompt}`,
                "",
                "Return JSON with label, summary, prompt, roles, warnings, reasoning.",
                "Each role needs: name, role, title, reportsToRole|null, brief.",
                "The prompt field should be a reusable prompt that starts with 'Suggested org structure:' and includes all roles.",
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "org_suggestion",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              summary: { type: "string" },
              prompt: { type: "string" },
              roles: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    role: { type: "string" },
                    title: { type: "string" },
                    reportsToRole: { type: ["string", "null"] },
                    brief: { type: "string" },
                  },
                  required: ["name", "role", "title", "reportsToRole", "brief"],
                },
              },
              warnings: { type: "array", items: { type: "string" } },
              reasoning: { type: "array", items: { type: "string" } },
            },
            required: ["label", "summary", "prompt", "roles", "warnings", "reasoning"],
          },
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI org suggestion request failed (${response.status})`);
  }
  const payload = await response.json() as { output_text?: string };
  const outputText = nonEmpty(payload.output_text);
  if (!outputText) {
    throw new Error("OpenAI org suggestion response was empty");
  }
  return orgSuggestionPreviewResultSchema.parse({
    ...(JSON.parse(outputText) as Record<string, unknown>),
    source: "openai",
  });
}

function buildHeuristicPlan(prompt: string, agents: PlannerAgent[], context?: PlannerContext): MasterPromptPlanPreviewResult {
  const planningPrompt = buildPlanningPrompt(prompt, context);
  const tasks = splitPromptIntoTasks(prompt);
  const title = summarizePrompt(prompt);
  const issues = tasks.map((task, index) => ({
    title: task.length <= 120 ? task : `${task.slice(0, 117)}...`,
    description: `This task was generated from the master request.\n\n${planningPrompt}\n\nFocus area:\n${task}`,
    assigneeAgentId: assignAgent(agents, task),
    priority: inferPriority(task),
    status: "todo" as const,
    requestDepth: 0,
  }));

  const warnings: string[] = [];
  if (issues.some((issue) => !issue.assigneeAgentId)) {
    warnings.push("Some tasks could not be matched to an agent automatically and need manual assignment.");
  }
  if (issues.length === 1) {
    warnings.push("The prompt did not split cleanly into multiple workstreams, so the plan contains a single task.");
  }

  return masterPromptPlanPreviewResultSchema.parse({
    title: title || "Master plan",
    summary: `Generated ${issues.length} work item${issues.length === 1 ? "" : "s"} from the master prompt.`,
    issues,
    warnings,
    reasoning: [
      "Split the master prompt into discrete work items.",
      "Matched tasks to agents using role and capability keywords when possible.",
      "Left unmatched tasks unassigned for manual review.",
    ],
    source: "heuristic",
  });
}

async function buildOpenAiPlan(
  prompt: string,
  agents: PlannerAgent[],
  context?: PlannerContext,
): Promise<MasterPromptPlanPreviewResult> {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) {
    return buildHeuristicPlan(prompt, agents, context);
  }
  const planningPrompt = buildPlanningPrompt(prompt, context);

  const model = nonEmpty(process.env.STAPLE_MASTER_PLAN_MODEL) ?? "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are planning work for Staple. Split one master request into practical issue-sized tasks. Prefer complete, actionable tasks. Only assign tasks to agent IDs provided in the roster.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `Master prompt:\n${planningPrompt}`,
                "",
                "Agent roster:",
                ...agents.map((agent) =>
                  `- ${agent.id} | ${agent.name} | role=${agent.role} | title=${agent.title ?? ""} | capabilities=${agent.capabilities ?? ""}`),
                "",
                "Return JSON with title, summary, issues, warnings, reasoning.",
                "Each issue needs: title, description, assigneeAgentId|null, priority, status, requestDepth.",
                "Use status=todo unless the user explicitly asks otherwise.",
              ].join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "master_prompt_plan",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              issues: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    assigneeAgentId: {
                      anyOf: [
                        { type: "null" },
                        { type: "string", enum: agents.map((agent) => agent.id) },
                      ],
                    },
                    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    status: { type: "string", enum: ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"] },
                    requestDepth: { type: "integer", minimum: 0 },
                  },
                  required: ["title", "description", "assigneeAgentId", "priority", "status", "requestDepth"],
                },
              },
              warnings: {
                type: "array",
                items: { type: "string" },
              },
              reasoning: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["title", "summary", "issues", "warnings", "reasoning"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI planning request failed (${response.status})`);
  }

  const payload = await response.json() as { output_text?: string };
  const outputText = nonEmpty(payload.output_text);
  if (!outputText) {
    throw new Error("OpenAI planning response was empty");
  }

  return masterPromptPlanPreviewResultSchema.parse({
    ...(JSON.parse(outputText) as Record<string, unknown>),
    source: "openai",
  });
}

export function masterPromptPlanningService() {
  return {
    preview: async (input: { prompt: string; agents: PlannerAgent[]; context?: PlannerContext }) => {
      try {
        return await buildOpenAiPlan(input.prompt, input.agents, input.context);
      } catch {
        return buildHeuristicPlan(input.prompt, input.agents, input.context);
      }
    },
    normalizeApplyInput: (input: ApplyMasterPromptPlan) =>
      input.issues.map((issue) => ({
        title: issue.title.trim(),
        description: issue.description?.trim() || null,
        assigneeAgentId: issue.assigneeAgentId ?? null,
        priority: issue.priority,
        status: issue.status,
        requestDepth: issue.requestDepth,
      })),
    suggestOrg: async (input: { prompt: string; context?: PlannerContext }) => {
      try {
        return await buildOpenAiOrgSuggestion(input.prompt, input.context);
      } catch {
        return buildHeuristicOrgSuggestion(input.prompt, input.context);
      }
    },
  };
}
