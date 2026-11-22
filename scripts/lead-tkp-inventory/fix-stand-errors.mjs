/**
 * Fix stand errors after Lead→TKP seed:
 * 1) relationGroups «Стадия/отделы» — level 0 must be entity (not host list field)
 * 2) create «Стадии проекта» catalog with ids = protocol stage list options
 * 3) print SQL that must be applied for automation_render_template overload
 *
 * Usage: node scripts/lead-tkp-inventory/fix-stand-errors.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const envText = readFileSync(join(root, ".env"), "utf8");
const URL = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const KEY = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!URL || !KEY) throw new Error("Missing .env supabase vars");

const TKP = "entity-33de9416-88f2-4360-9f96-9c71d0886fbc";
const PROTO = "entity-7ecbb3e8-ec93-4e16-9539-7272ff979839";
const DEPT = "entity-8e7a618c-64f8-4385-a8d7-302e29161701";
const DEPT_CALC = "entity-dept-calculations-seed";
const PROTO_STAGES = "field-8411906a-c6a2-49cb-a357-eacced6eb371";
const TKP_GROUPS = "field-tkp-stage-departments-seed";
const TKP_STAGES_LIST = "field-tkp-project-stages-seed";
const DEPT_CALC_GROUPS = "field-deptcalc-groups-seed";
const DEPT_HEAD = "field-640540ba-4b47-4e22-8270-b4bfbff081fd";
const STAGES_ENTITY = "entity-project-stages-seed";
const STAGES_NAME = "field-project-stages-name-seed";

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
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) throw new Error(`${r.status} ${path}: ${text.slice(0, 800)}`);
  return data;
}

function baseField(partial) {
  return {
    hint: "",
    group: "",
    tabId: "overview",
    locked: false,
    colSpan: 1,
    rowSpan: 1,
    decimals: 2,
    required: false,
    listFixed: false,
    systemKey: null,
    tableOrder: 50,
    unitSuffix: null,
    listOptions: [],
    showInTable: true,
    sumFieldIds: [],
    listMultiple: false,
    showOnCreate: true,
    showOnRecord: true,
    booleanInline: false,
    listUseColors: true,
    showInFilters: true,
    includeInTotal: false,
    listAllowOther: false,
    datetimeWithTime: false,
    relationEntityId: null,
    relationMultiple: false,
    listSourceFieldId: null,
    listShowEmptyValue: true,
    listDependsOnFieldId: null,
    visibilityConditions: [],
    ...partial,
  };
}

function groupsConfig() {
  return {
    levels: [
      {
        id: "rgl-stages-seed",
        source: {
          kind: "entity",
          entityId: STAGES_ENTITY,
          limitFieldId: null,
        },
        displayFieldIds: [],
        defaultIds: [],
        layout: "column",
      },
      {
        id: "rgl-depts-seed",
        source: {
          kind: "entity",
          entityId: DEPT,
          limitFieldId: null,
        },
        displayFieldIds: [DEPT_HEAD],
        defaultIds: [],
        layout: "column",
      },
    ],
  };
}

async function main() {
  const signup = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `fix${Date.now()}@example.com`,
      password: "ScenarioBuilder1!",
    }),
  });
  const auth = await signup.json();
  const token = auth.access_token;
  if (!token) throw new Error(`auth failed: ${JSON.stringify(auth)}`);

  const ents = await api(token, "entities?select=id,definition");
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]));
  const proto = byId[PROTO]?.definition;
  const stageOptions =
    proto?.fields?.find((f) => f.id === PROTO_STAGES)?.listOptions ?? [];
  if (stageOptions.length === 0) {
    throw new Error("Protocol stage list options missing");
  }

  const stagesDef = {
    id: STAGES_ENTITY,
    name: "Стадии проекта",
    namePlural: "Стадии проекта",
    icon: "layers",
    fields: [
      baseField({
        id: STAGES_NAME,
        name: "Название",
        type: "text",
        required: true,
        locked: true,
        tableOrder: 1,
        colSpan: 4,
      }),
    ],
    tabs: [
      {
        id: "overview",
        kind: "fields",
        name: "Обзор",
        locked: true,
        sourceTabId: null,
        singleRecord: false,
        defaultFolders: [],
        linkedEntityId: null,
        parentLinkFieldId: null,
        sourceRelationFieldId: null,
      },
    ],
    fieldGroups: [],
    kanban: null,
    table: { pageSize: 50 },
  };

  if (byId[STAGES_ENTITY]) {
    await api(token, `entities?id=eq.${STAGES_ENTITY}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ definition: stagesDef }),
    });
  } else {
    await api(token, "entities", {
      method: "POST",
      body: JSON.stringify({ id: STAGES_ENTITY, definition: stagesDef }),
    });
  }
  console.log("upserted entity Стадии проекта");

  // Upsert stage records with ids = protocol list option ids (hardcode-compatible).
  for (const opt of stageOptions) {
    const id = opt.id;
    const name = String(opt.name || "").trim() || id;
    const existing = await api(
      token,
      `entity_records?id=eq.${encodeURIComponent(id)}&select=id`,
    );
    const row = {
      id,
      entity_id: STAGES_ENTITY,
      field_values: { [STAGES_NAME]: name },
    };
    if (existing?.length) {
      await api(token, `entity_records?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          entity_id: STAGES_ENTITY,
          field_values: { [STAGES_NAME]: name },
        }),
      });
    } else {
      await api(token, "entity_records", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify(row),
      });
    }
    console.log("stage record", id, name);
  }

  // Patch TKP relationGroups + hide redundant multi-list (roots live in groups).
  const tkpDef = structuredClone(byId[TKP].definition);
  const groupsField = tkpDef.fields.find((f) => f.id === TKP_GROUPS);
  if (!groupsField) throw new Error("TKP groups field missing — re-run seed");
  groupsField.relationGroups = groupsConfig();
  groupsField.required = true;

  const listField = tkpDef.fields.find((f) => f.id === TKP_STAGES_LIST);
  if (listField) {
    listField.showOnCreate = false;
    listField.showOnRecord = false;
    listField.required = false;
    listField.listOptions = structuredClone(stageOptions);
  }

  await api(token, `entities?id=eq.${TKP}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ definition: tkpDef }),
  });
  console.log("patched Разбор ТКП Стадия/отделы → entity/entity");

  if (byId[DEPT_CALC]) {
    const dcDef = structuredClone(byId[DEPT_CALC].definition);
    const dcGroups = dcDef.fields.find((f) => f.id === DEPT_CALC_GROUPS);
    if (dcGroups) {
      dcGroups.relationGroups = {
        levels: [
          {
            id: "rgl-dc-stages",
            source: {
              kind: "entity",
              entityId: STAGES_ENTITY,
              limitFieldId: null,
            },
            displayFieldIds: [],
            defaultIds: [],
            layout: "column",
          },
          {
            id: "rgl-dc-depts",
            source: {
              kind: "entity",
              entityId: DEPT,
              limitFieldId: null,
            },
            displayFieldIds: [DEPT_HEAD],
            defaultIds: [],
            layout: "column",
          },
        ],
      };
      await api(token, `entities?id=eq.${DEPT_CALC}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ definition: dcDef }),
      });
      console.log("patched Расчёты отделов Стадия/отделы");
    }
  }

  // Step 6 ask fields: drop obsolete list field from required/visible.
  const step6 = await api(
    token,
    `automation_task_templates?id=eq.atpl-tkp-select-dept-heads&select=*`,
  );
  if (step6?.[0]) {
    const t = step6[0];
    const outcomes = structuredClone(t.outcomes || []);
    for (const o of outcomes) {
      const fa = o.fieldAccess || o.field_access;
      if (!fa) continue;
      const strip = (ids) => (ids || []).filter((id) => id !== TKP_STAGES_LIST);
      fa.visibleFieldIds = strip(fa.visibleFieldIds);
      fa.requiredFieldIds = strip(fa.requiredFieldIds);
      if (!fa.visibleFieldIds.includes(TKP_GROUPS)) {
        fa.visibleFieldIds = [
          TKP_GROUPS,
          "field-tkp-calc-deadline-seed",
          "field-tkp-heads-comment-seed",
          ...fa.visibleFieldIds,
        ];
      }
      if (!fa.requiredFieldIds.includes(TKP_GROUPS)) {
        fa.requiredFieldIds = [
          TKP_GROUPS,
          "field-tkp-calc-deadline-seed",
          "field-tkp-heads-comment-seed",
          ...fa.requiredFieldIds,
        ];
      }
      o.fieldAccess = fa;
    }
    await api(
      token,
      `automation_task_templates?id=eq.atpl-tkp-select-dept-heads`,
      {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ outcomes }),
      },
    );
    console.log("patched step 6 field access");
  }

  const sqlPath = join(
    root,
    "supabase/migrations/20261119130000_fix_render_template_overload.sql",
  );
  const sql = readFileSync(sqlPath, "utf8");
  writeFileSync(
    join(root, "scripts/lead-tkp-inventory/APPLY_RENDER_TEMPLATE_FIX.sql"),
    sql,
  );

  console.log("\n=== REQUIRED: apply SQL in Supabase SQL Editor ===");
  console.log(sql);
  console.log("=== end SQL ===\n");
  console.log(
    "Schema/UI fixes applied via REST. Without the SQL above, create still fails with 42725.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
