/**
 * Export Lead + «Разбор ТКП» automation config from the configured Supabase.
 * Usage: node scripts/lead-tkp-inventory/export-automation-config.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const envText = readFileSync(join(root, ".env"), "utf8");
const url = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const sb = createClient(url, key);
const { data: processes, error: pErr } = await sb
  .from("automation_processes")
  .select("*");
if (pErr) throw pErr;

const leadTkp = (processes ?? []).filter((p) => {
  const name = `${p.name ?? ""}`.toLowerCase();
  return (
    name.includes("лид") || name.includes("ткп") || name.includes("разбор")
  );
});

const processIds = leadTkp.map((p) => p.id);
const { data: scenarios } = await sb
  .from("automation_scenarios")
  .select("*")
  .in("process_id", processIds.length ? processIds : ["__none__"]);
const scenarioIds = (scenarios ?? []).map((s) => s.id);
const { data: templates } = await sb
  .from("automation_task_templates")
  .select("*")
  .in("scenario_id", scenarioIds.length ? scenarioIds : ["__none__"]);
const { data: rules } = await sb
  .from("automation_notification_rules")
  .select("*")
  .in("template_id", (templates ?? []).map((t) => t.id).concat("__none__"));

const outDir = join(root, "scripts/lead-tkp-inventory");
mkdirSync(outDir, { recursive: true });
const out = {
  exportedAt: new Date().toISOString(),
  processes: leadTkp,
  scenarios: scenarios ?? [],
  templates: templates ?? [],
  notificationRules: rules ?? [],
};
const path = join(outDir, "automation-export.json");
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(
  `Wrote ${path}: processes=${leadTkp.length} scenarios=${out.scenarios.length} templates=${out.templates.length}`,
);
