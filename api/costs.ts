import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { company_id, agent_id } = req.query;

  if (req.method === "GET") {
    let query = supabase.from("cost_events").select("*").order("occurred_at", { ascending: false }).limit(100);
    if (company_id) query = query.eq("company_id", company_id as string);
    if (agent_id) query = query.eq("agent_id", agent_id as string);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === "POST") {
    const { company_id: bodyCompanyId, agent_id: bodyAgentId, provider, model, input_tokens, output_tokens, cost_cents } = req.body;
    if (!bodyCompanyId || !bodyAgentId || !provider || !model) {
      res.status(400).json({ error: "company_id, agent_id, provider, and model are required" });
      return;
    }

    const { data, error } = await supabase
      .from("cost_events")
      .insert({
        company_id: bodyCompanyId,
        agent_id: bodyAgentId,
        provider,
        model,
        input_tokens: input_tokens ?? 0,
        output_tokens: output_tokens ?? 0,
        cost_cents: cost_cents ?? 0,
        occurred_at: new Date().toISOString(),
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
