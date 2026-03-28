import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { company_id } = req.query;

  if (req.method === "GET") {
    if (!company_id) {
      res.status(400).json({ error: "company_id required" });
      return;
    }

    const { data, error } = await supabase
      .from("api_key_vault")
      .select("id, name, provider, is_active, last_used_at, created_at")
      .eq("company_id", company_id as string)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json(data);
    return;
  }

  if (req.method === "POST") {
    const { company_id: bodyCompanyId, name, provider, value, description } = req.body;
    if (!bodyCompanyId || !name || !provider || !value) {
      res.status(400).json({ error: "company_id, name, provider, and value are required" });
      return;
    }

    const { data, error } = await supabase
      .from("api_key_vault")
      .upsert(
        {
          company_id: bodyCompanyId,
          name,
          provider,
          encrypted_value: value,
          description: description ?? null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,name" },
      )
      .select("id, name, provider, is_active, created_at")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(201).json(data);
    return;
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }

    const { error } = await supabase
      .from("api_key_vault")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id as string);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
