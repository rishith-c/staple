import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { company_id } = req.query;

  if (req.method === "GET") {
    let query = supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (company_id) query = query.eq("company_id", company_id as string);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === "POST") {
    const { name, description, company_id: bodyCompanyId, goal_id, lead_agent_id, target_date } = req.body;
    if (!name || !bodyCompanyId) {
      res.status(400).json({ error: "name and company_id are required" });
      return;
    }

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        description,
        company_id: bodyCompanyId,
        goal_id: goal_id ?? null,
        lead_agent_id: lead_agent_id ?? null,
        target_date: target_date ?? null,
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

  res.status(405).json({ error: "Method not allowed" });
}
