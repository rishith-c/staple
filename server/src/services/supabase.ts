import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? "";

export const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

export const createClient = () => createSupabaseClient(supabaseUrl, supabaseKey);

/**
 * Fetch API keys from the Supabase vault for a given company.
 */
export async function getApiKeysForCompany(companyId: string) {
  const { data, error } = await supabase
    .from("api_key_vault")
    .select("name, provider, encrypted_value, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to fetch API keys: ${error.message}`);
  }

  return data;
}

/**
 * Store or update an API key in the Supabase vault.
 */
export async function upsertApiKey(
  companyId: string,
  name: string,
  provider: string,
  value: string,
  description?: string,
) {
  const { data, error } = await supabase
    .from("api_key_vault")
    .upsert(
      {
        company_id: companyId,
        name,
        provider,
        encrypted_value: value,
        description: description ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,name" },
    )
    .select();

  if (error) {
    throw new Error(`Failed to upsert API key: ${error.message}`);
  }

  return data;
}
