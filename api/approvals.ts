import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { company_id, status } = req.query;

  if (req.method === "GET") {
    let query = supabase.from("approvals").select("*").order("created_at", { ascending: false });
    if (company_id) query = query.eq("company_id", company_id as string);
    if (status) query = query.eq("status", status as string);

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === "PATCH") {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }

    const { status: newStatus, decision_note, decided_by_user_id } = req.body;
    const { data, error } = await supabase
      .from("approvals")
      .update({
        status: newStatus,
        decision_note,
        decided_by_user_id,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
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
