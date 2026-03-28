import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { company_id } = req.query;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!company_id) {
    res.status(400).json({ error: "company_id required" });
    return;
  }

  const cid = company_id as string;

  const [companyRes, agentsRes, issuesRes, goalsRes, projectsRes, costsRes, approvalsRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", cid).single(),
    supabase.from("agents").select("id, name, status, role, adapter_type, budget_monthly_cents, spent_monthly_cents").eq("company_id", cid),
    supabase.from("issues").select("id, status, priority, assignee_agent_id").eq("company_id", cid),
    supabase.from("goals").select("id, status, level").eq("company_id", cid),
    supabase.from("projects").select("id, status").eq("company_id", cid),
    supabase.from("cost_events").select("cost_cents, provider, model").eq("company_id", cid),
    supabase.from("approvals").select("id, status").eq("company_id", cid).eq("status", "pending"),
  ]);

  const issues = issuesRes.data ?? [];
  const costs = costsRes.data ?? [];

  res.status(200).json({
    company: companyRes.data,
    agents: {
      total: (agentsRes.data ?? []).length,
      active: (agentsRes.data ?? []).filter((a: { status: string }) => a.status === "active").length,
      idle: (agentsRes.data ?? []).filter((a: { status: string }) => a.status === "idle").length,
      list: agentsRes.data ?? [],
    },
    issues: {
      total: issues.length,
      backlog: issues.filter((i: { status: string }) => i.status === "backlog").length,
      in_progress: issues.filter((i: { status: string }) => i.status === "in_progress").length,
      done: issues.filter((i: { status: string }) => i.status === "done").length,
    },
    goals: {
      total: (goalsRes.data ?? []).length,
      active: (goalsRes.data ?? []).filter((g: { status: string }) => g.status === "active").length,
    },
    projects: {
      total: (projectsRes.data ?? []).length,
    },
    costs: {
      total_cents: costs.reduce((sum: number, c: { cost_cents: number }) => sum + c.cost_cents, 0),
      event_count: costs.length,
    },
    pending_approvals: (approvalsRes.data ?? []).length,
  });
}
