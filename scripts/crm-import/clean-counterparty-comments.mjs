/**
 * Clean Bitrix markers/BBCode from Контрагенты comments in place.
 * Keeps human-readable text. Idempotent.
 *
 *   node scripts/crm-import/clean-counterparty-comments.mjs
 *   node scripts/crm-import/clean-counterparty-comments.mjs --dry-run
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { sanitizeImportedComment } from "./sanitize-comment.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const envText = readFileSync(join(root, ".env"), "utf8");
const URL = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const KEY = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!URL || !KEY) throw new Error("Missing .env supabase vars");

const ENTITY_CP = "entity-02300c84-41e0-4f71-9f37-19edef1d56e6";
const FIELD_COMMENT = "field-cad6973c-edda-483d-a3a2-00cf24c4d9da";
const dryRun = process.argv.includes("--dry-run");

async function api(token, path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const body = await r.text();
  let data;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = body;
  }
  if (!r.ok) throw new Error(`${r.status} ${path}: ${body.slice(0, 400)}`);
  return data;
}

async function auth() {
  const email = `crm-clean-comments-${Date.now()}@centripk.ru`;
  const signup = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "CrmImport1!" }),
  });
  const authJson = await signup.json();
  if (!authJson.access_token)
    throw new Error(`auth failed: ${JSON.stringify(authJson)}`);
  return authJson.access_token;
}

async function fetchAll(token) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const rows = await api(
      token,
      `entity_records?entity_id=eq.${ENTITY_CP}&select=id,field_values`,
      { headers: { Range: `${from}-${from + 999}` } },
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

async function main() {
  const token = await auth();
  const rows = await fetchAll(token);
  let changed = 0;
  let emptied = 0;
  let skipped = 0;
  const samples = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const fv = { ...(row.field_values || {}) };
    const before = fv[FIELD_COMMENT] ?? "";
    if (typeof before !== "string" || !before) {
      skipped += 1;
      continue;
    }
    const after = sanitizeImportedComment(before);
    if (after === before) {
      skipped += 1;
      continue;
    }

    if (samples.length < 5) {
      samples.push({
        id: row.id,
        before: before.slice(0, 180),
        after: after.slice(0, 180),
      });
    }

    if (!after) {
      delete fv[FIELD_COMMENT];
      emptied += 1;
    } else {
      fv[FIELD_COMMENT] = after;
    }
    changed += 1;

    if (!dryRun) {
      await api(token, `entity_records?id=eq.${row.id}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ field_values: fv }),
      });
    }

    if ((i + 1) % 200 === 0) console.log(`progress ${i + 1}/${rows.length}`);
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        total: rows.length,
        changed,
        emptied,
        skipped,
        samples,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
