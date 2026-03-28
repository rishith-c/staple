import { createClient as createBrowserClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const supabase = createBrowserClient(supabaseUrl, supabaseKey);

export const createClient = () => createBrowserClient(supabaseUrl, supabaseKey);
