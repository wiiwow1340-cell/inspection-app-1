import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const projectRef = supabaseUrl
  ? new URL(supabaseUrl).hostname.split(".")[0]
  : "";
const storageKey = projectRef ? `sb-${projectRef}-auth-token` : "sb-auth-token";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storageKey,
  },
});
