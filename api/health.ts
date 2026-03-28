import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_ANON_KEY ?? "",
);

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const { error } = await supabase.from("companies").select("id").limit(1);

  res.status(200).json({
    status: "ok",
    database: error ? "error" : "connected",
    timestamp: new Date().toISOString(),
  });
}
