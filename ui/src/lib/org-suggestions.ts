export type OrgSuggestionAgent = {
  id?: string;
  name: string;
  role: string;
  title: string | null;
};

export type OrgSuggestionRole = {
  name: string;
  role: string;
  title: string;
  reportsToRole?: string;
  brief: string;
};

export type OrgSuggestionTemplate = {
  id: string;
  label: string;
  description: string;
  prompt: string;
  roles: OrgSuggestionRole[];
};

function buildContextLines(projectName?: string | null, goalTitle?: string | null) {
  const lines: string[] = [];
  if (projectName) lines.push(`Project context: ${projectName}`);
  if (goalTitle) lines.push(`Goal context: ${goalTitle}`);
  if (lines.length > 0) lines.push("");
  return lines;
}

function formatTemplatePrompt(
  title: string,
  roles: OrgSuggestionRole[],
  projectName?: string | null,
  goalTitle?: string | null,
) {
  return [
    "Suggested org structure:",
    ...roles.map((role) =>
      `- ${role.name} | role=${role.role} | title=${role.title}${role.reportsToRole ? ` | reports_to_role=${role.reportsToRole}` : ""}`),
    "",
    ...buildContextLines(projectName, goalTitle),
    "Master request:",
    `Build this team so it can execute ${title.toLowerCase()} with clear ownership, reporting lines, and practical task boundaries.`,
  ].join("\n");
}

export function buildOrgSuggestionTemplates(input: {
  agents: OrgSuggestionAgent[];
  projectName?: string | null;
  goalTitle?: string | null;
}): OrgSuggestionTemplate[] {
  const { agents, projectName, goalTitle } = input;
  const templates: OrgSuggestionTemplate[] = [];

  if (agents.length > 0) {
    templates.push({
      id: "current",
      label: "Current team",
      description: "Start from the current org and expand around it.",
      roles: agents.slice(0, 8).map((agent) => ({
        name: agent.name,
        role: agent.role,
        title: agent.title ?? agent.role,
        brief: `Keep ${agent.name} in the org as ${agent.title ?? agent.role}.`,
      })),
      prompt: [
        "Suggested org structure:",
        ...agents
          .slice(0, 8)
          .map((agent) => `- ${agent.name} | role=${agent.role}${agent.title ? ` | title=${agent.title}` : ""}`),
        "",
        ...buildContextLines(projectName, goalTitle),
        "Master request:",
        "Expand this existing team into a practical operating org with clear ownership and execution lanes.",
      ].join("\n"),
    });
  }

  const startupRoles: OrgSuggestionRole[] = [
    {
      name: "CEO",
      role: "ceo",
      title: "Chief Executive Officer",
      brief: "Own strategy, priorities, and cross-team coordination.",
    },
    {
      name: "CTO",
      role: "cto",
      title: "Chief Technology Officer",
      reportsToRole: "ceo",
      brief: "Own technical direction, architecture, and engineering hiring.",
    },
    {
      name: "Product Designer",
      role: "designer",
      title: "Product Designer",
      reportsToRole: "ceo",
      brief: "Own UX flows, visual direction, and product design quality.",
    },
    {
      name: "Frontend Engineer",
      role: "engineer",
      title: "Frontend Engineer",
      reportsToRole: "cto",
      brief: "Build UI, polish product flows, and implement frontend features.",
    },
    {
      name: "Backend Engineer",
      role: "engineer",
      title: "Backend Engineer",
      reportsToRole: "cto",
      brief: "Build APIs, data models, integrations, and backend features.",
    },
    {
      name: "QA Engineer",
      role: "qa",
      title: "QA Engineer",
      reportsToRole: "cto",
      brief: "Own validation, test plans, regression checks, and release confidence.",
    },
  ];

  const productRoles: OrgSuggestionRole[] = [
    startupRoles[0]!,
    {
      name: "Product Manager",
      role: "pm",
      title: "Product Manager",
      reportsToRole: "ceo",
      brief: "Own scope, specs, priorities, and delivery clarity.",
    },
    startupRoles[2]!,
    startupRoles[3]!,
    startupRoles[4]!,
    startupRoles[5]!,
  ];

  const engineeringRoles: OrgSuggestionRole[] = [
    startupRoles[0]!,
    startupRoles[1]!,
    {
      name: "Senior Full Stack Engineer",
      role: "engineer",
      title: "Senior Full Stack Engineer",
      reportsToRole: "cto",
      brief: "Ship major features end to end and break projects into implementation plans.",
    },
    {
      name: "DevOps Engineer",
      role: "devops",
      title: "DevOps Engineer",
      reportsToRole: "cto",
      brief: "Own deploys, CI, observability, and runtime reliability.",
    },
    startupRoles[5]!,
  ];

  templates.push({
    id: "startup",
    label: "Startup pod",
    description: "Balanced founding team for shipping a product quickly.",
    roles: startupRoles,
    prompt: formatTemplatePrompt("a new product", startupRoles, projectName, goalTitle),
  });
  templates.push({
    id: "product",
    label: "Product squad",
    description: "Heavier on product planning and design execution.",
    roles: productRoles,
    prompt: formatTemplatePrompt("a product-led roadmap", productRoles, projectName, goalTitle),
  });
  templates.push({
    id: "engineering",
    label: "Engineering pod",
    description: "Optimized for implementation, infrastructure, and delivery.",
    roles: engineeringRoles,
    prompt: formatTemplatePrompt("an engineering-heavy roadmap", engineeringRoles, projectName, goalTitle),
  });

  return templates;
}
