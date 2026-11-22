/** Verify automation_render_template overload is fixed on the stand. */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const env = readFileSync(join(root, ".env"), "utf8");
const SUPABASE_URL = env.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)[1].trim();

const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: `v${Date.now()}@example.com`,
    password: "ScenarioBuilder1!",
  }),
});
const { access_token: token } = await signup.json();
const h = {
  apikey: KEY,
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const r2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/automation_render_template`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ p_template: "ok", p_values: {} }),
});
const t2 = await r2.text();
if (r2.status === 200) {
  console.log("OK: overload fixed — spawn can create task names");
  process.exit(0);
}
console.error("NOT FIXED:", r2.status, t2);
console.error(
  "Apply scripts/lead-tkp-inventory/APPLY_RENDER_TEMPLATE_FIX.sql in Supabase SQL Editor, then re-enter the stage.",
);
process.exit(1);
