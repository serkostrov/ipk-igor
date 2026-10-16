import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type IpkEnvKey = "VITE_SUPABASE_URL" | "VITE_SUPABASE_ANON_KEY";

/** Prefer Docker/Dokploy runtime `/env.js`, then Vite build-time env. */
function readEnv(key: IpkEnvKey): string {
  const runtime =
    typeof window !== "undefined" ? window.__IPK_ENV__?.[key] : undefined;
  if (typeof runtime === "string" && runtime.trim().length > 0) {
    return runtime.trim();
  }
  const baked = import.meta.env[key];
  return typeof baked === "string" ? baked.trim() : "";
}

const url = readEnv("VITE_SUPABASE_URL");
const anonKey = readEnv("VITE_SUPABASE_ANON_KEY");

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.error(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. " +
      "Locally: set them in .env. In Docker/Dokploy: set Environment (or Build Args) " +
      "so docker-entrypoint can write /env.js.",
  );
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;
