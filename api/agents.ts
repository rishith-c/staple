import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { company_id } = req.query;

  if (req.method === "GET") {
    let query = supabase.from("agents").select("*").order("created_at", { ascending: false });
    if (company_id) {
      query = query.eq("company_id", company_id as string);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === "POST") {
    const { name, role, title, adapter_type, company_id: bodyCompanyId, budget_monthly_cents } = req.body;
    if (!name || !bodyCompanyId) {
      res.status(400).json({ error: "name and company_id are required" });
      return;
    }

    const { data, error } = await supabase
      .from("agents")
      .insert({
        name,
        role: role ?? "general",
        title,
        adapter_type: adapter_type ?? "process",
        company_id: bodyCompanyId,
        budget_monthly_cents: budget_monthly_cents ?? 0,
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
