import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { company_id, status, assignee_agent_id } = req.query;

  if (req.method === "GET") {
    let query = supabase.from("issues").select("*").order("created_at", { ascending: false });
    if (company_id) query = query.eq("company_id", company_id as string);
    if (status) query = query.eq("status", status as string);
    if (assignee_agent_id) query = query.eq("assignee_agent_id", assignee_agent_id as string);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === "POST") {
    const { title, description, company_id: bodyCompanyId, project_id, goal_id, priority, assignee_agent_id: bodyAssignee } = req.body;
    if (!title || !bodyCompanyId) {
      res.status(400).json({ error: "title and company_id are required" });
      return;
    }

    const { data, error } = await supabase
      .from("issues")
      .insert({
        title,
        description,
        company_id: bodyCompanyId,
        project_id: project_id ?? null,
        goal_id: goal_id ?? null,
        priority: priority ?? "medium",
        assignee_agent_id: bodyAssignee ?? null,
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
    return;
  }

  if (req.method === "PATCH") {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: "id query param required" });
      return;
    }

    const updates = req.body;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("issues")
      .update(updates)
      .eq("id", id as string)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
