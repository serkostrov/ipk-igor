/**
 * Seed Lead → Разбор ТКП automation scenario on the stand (etalon steps 1–13).
 * Usage: node scripts/lead-tkp-inventory/seed-lead-tkp-scenario.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const envText = readFileSync(join(root, ".env"), "utf8");
const URL = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const KEY = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!URL || !KEY) throw new Error("Missing .env supabase vars");

const LEAD = "entity-92b11740-64de-40bc-9687-3194f33fdba0";
const TKP = "entity-33de9416-88f2-4360-9f96-9c71d0886fbc";
const PROTO = "entity-7ecbb3e8-ec93-4e16-9539-7272ff979839";
const DEPT = "entity-8e7a618c-64f8-4385-a8d7-302e29161701";
const USERS = "entity-system-users";

const LEAD_PROC = "aproc-41184a46-8b49-47e9-a09d-9ebcf57c5292";
const LEAD_SCEN = "ascen-7bb64fab-36db-4695-844e-86f3e62bf259";
const TKP_PROC = "aproc-3f6245f2-5de5-45db-a2ee-fa11ab51245f";
const TKP_SCEN = "ascen-4c3941b1-1af1-44fb-bde8-70668370a8e9";
const LEAD_FUNNEL_PROC = "aproc-8ec100a8-17c3-43c9-a413-8867550ee336";

const LEAD_STAGE = {
  draft: "list-c1cc666d-75c5-42b6-a1cc-62e00622c27c",
  decision: "list-50b1cc0b-593a-4fcf-bc18-be4250a91bfe",
  gipLeadDept: "list-aad1e473-4c06-4e58-a615-f175c091d282",
  gipFilling: "list-076966e5-8752-49dc-9fef-566defac3053",
  tkpCalc: "list-c98611ec-0345-4af2-8b7e-cf620a56f5e0",
  customer: "list-a4ba825e-4048-4c7a-ab60-b27002644a6e",
  recalc: "list-7bf15acd-8df9-4863-a0cb-ddefc17b9c8f",
};
const TKP_STAGE = {
  created: "list-e52005a1-7ef4-4e84-b3a4-51eae02b8fc1",
  /** After step 5. Step 6 lives here — not on «Создано» (ТЗ: иначе выбор отделов раньше задания 5). */
  selectDepts: "list-tkp-select-departments",
  depts: "list-a2770d1f-b9f5-4d3a-bbc8-8285f985ffcd",
  gipFill: "list-2940589b-616a-4975-a3c0-a0110a72558c",
  chiefApprove: "list-acaaeb37-4846-4a54-8c78-2231a8ed403c",
  price: "list-45e87a17-c9cd-4402-af54-6edb4250bee3",
  approveGip: "list-c69b63d0-45a6-4882-adcb-3a16b6449550",
  approveRko: "list-bf2ec7e4-daec-4b10-b6da-a9b2531a4fd5",
  approveGd: "list-a325f76f-1775-4bee-8506-351fe3eb7b29",
  readySend: "list-721cd9b1-a00b-4b6a-8e57-24758a8c8b50",
  sent: "list-c9c28e55-dfe4-481f-8494-2a18d52ba661",
};

const F = {
  leadName: "field-c071107e-4baf-4926-ac0b-a1822a0d364b",
  leadStage: "field-09cf11df-e26b-4d70-840a-9cc71c825016",
  leadCounterparty: "field-0d7e7514-84cf-498d-8660-556ce7f8b903",
  leadContact: "field-d2e21c46-caa0-4327-ab2d-8d5a4445eec9",
  leadManager: "field-d8ec5a44-6c39-4a73-8a38-103b271f3e17",
  leadGip: "field-b27adecc-4e17-40b1-8a9e-4af03d49ce66",
  leadDeadline: "field-2a24689c-d3ac-41f7-b1b8-6feee69855f6",
  leadLegal: "field-16700f42-1f14-4f3d-9a64-f123c2df3180",
  leadFunnel: "field-fb994696-9b90-4aa9-ad37-4ac2322910e7",
  leadComment: "field-17cec197-f54e-41fc-97e8-ad6c2f8d205b",
  tkpName: "field-8a5551bb-3a87-4007-a03a-1d1c3102312d",
  tkpStatus: "field-ebd4459c-2cc4-463a-80f5-cbbc35a95a82",
  tkpLead: "field-9fe24291-44ca-4031-b47f-cb99898564bc",
  protoLead: "field-5da97a4c-d240-43f2-80d8-d35eddecb7c1",
  protoName: "field-e9da05d5-93d2-4d3a-8cef-e97bc639f2df",
  protoLeadDept: "field-aeaa4a93-6c85-41e7-a1f1-b7305ea66ec6",
  protoDeptHeadLookup: "field-7e65b215-1dba-4206-b3fb-a3d5c3e4e63a",
  protoGipDesc: "field-114ed87b-6b59-48ed-a175-1220f2d55dc8",
  protoDeptDesc: "field-343604c3-ff4d-4bca-a0e3-f57e1c11b4b5",
  protoStages: "field-8411906a-c6a2-49cb-a357-eacced6eb371",
  protoTkp: "field-42853a00-aadc-40eb-b6f6-98bb0dbe541a",
  deptHead: "field-640540ba-4b47-4e22-8270-b4bfbff081fd",
  leadTkpTab: "tab-4b478146-7a94-4679-b2fa-ea49af4ec263",
  leadProtoTab: "tab-2f1f0176-8a95-4622-acb7-c5cc4683e16c",
  tkpProtoTab: "tab-67ed91d6-9641-4d1f-8707-dd50c0ccdaaa",
};

// New ids we create
const NEW = {
  leadChief: "field-lead-chief-engineer-seed",
  leadGipComment: "field-lead-gip-comment-seed",
  leadRejectReason: "field-lead-reject-reason-seed",
  leadGipAssignDate: "field-lead-gip-assign-date-seed",
  funnelEntity: "entity-funnels-seed",
  funnelName: "field-funnel-name-seed",
  funnelChief: "field-funnel-chief-seed",
  deptSphere: "field-dept-sphere-seed",
  deptSphereProduction: "list-dept-sphere-production",
  tkpGroups: "field-tkp-stage-departments-seed",
  tkpCalcDeadline: "field-tkp-calc-deadline-seed",
  tkpHeadsComment: "field-tkp-heads-comment-seed",
  deptCalcEntity: "entity-dept-calculations-seed",
  deptCalcParent: "field-deptcalc-parent-tkp-seed",
  deptCalcName: "field-deptcalc-name-seed",
  deptCalcGroups: "field-deptcalc-groups-seed",
  deptCalcManager: "field-deptcalc-manager-seed",
  deptCalcPerformer: "field-deptcalc-performer-seed",
  tkpDeptTab: "tab-tkp-dept-calculations-seed",
};

const ROLE_GD = "role-general-director";
const USER_DEPT = "field-868917ac-2d79-4e8a-b28d-165f7b126ce7";
const USER_ROLE = "field-system-users-role";
const USER_EMAIL = "field-system-users-email";

const emptyCond = { version: 1, match: "all", rules: [] };
const emptyAccess = () => ({
  visibleFieldIds: [],
  requiredFieldIds: [],
  readonlyFieldIds: [],
  relatedVisibleFields: [],
  relatedRequiredIds: [],
  requireAttachment: false,
  reasonFieldId: null,
  relatedReasonId: null,
});

/** Return-to-previous-stage: comment is required and becomes the highlight on the new task. */
function returnReasonAccess(reasonFieldId) {
  return {
    ...emptyAccess(),
    visibleFieldIds: [reasonFieldId],
    requiredFieldIds: [reasonFieldId],
    reasonFieldId,
  };
}

function askAccess(items, extra = {}) {
  const relatedVisibleFields = items.map(({ required, ...field }) => field);
  const relatedRequiredIds = items
    .filter((item) => item.required)
    .map((item) => item.id);
  return {
    ...emptyAccess(),
    ...extra,
    relatedVisibleFields,
    relatedRequiredIds,
  };
}

/** Step 7: department table (срок / описание / комментарий) on the task. */
function deptCalcAsk(requireDeadline) {
  return askAccess(
    [
      {
        id: "rel-deptcalc-deadline",
        linkedTabId: NEW.tkpDeptTab,
        relationFieldId: "",
        fieldId: "field-deptcalc-deadline-seed",
        required: requireDeadline,
      },
      {
        id: "rel-deptcalc-description",
        linkedTabId: NEW.tkpDeptTab,
        relationFieldId: "",
        fieldId: "field-deptcalc-description-seed",
        required: false,
      },
      {
        id: "rel-deptcalc-comment",
        linkedTabId: NEW.tkpDeptTab,
        relationFieldId: "",
        fieldId: "field-deptcalc-comment-seed",
        required: false,
      },
    ],
    { requireTimeTracking: true },
  );
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
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

function outcome(
  label,
  color,
  actions = [],
  fieldAccess = emptyAccess(),
  { isReturn = false, keepFilledData = true } = {},
) {
  return {
    id: uid("aout"),
    label,
    color,
    actions,
    fieldAccess,
    conditions: emptyCond,
    buttonMode: "auto",
    isReturn: isReturn === true,
    // Only meaningful for return buttons; default keep prior values.
    keepFilledData: isReturn === true ? keepFilledData !== false : true,
  };
}

/** Return-to-previous-stage button with reason field and isReturn flag. */
function returnOutcome(label, color, actions, reasonFieldId) {
  return outcome(label, color, actions, returnReasonAccess(reasonFieldId), {
    isReturn: true,
    keepFilledData: true,
  });
}

function setField(fieldId, value) {
  return { id: uid("aact"), kind: "setField", fieldId, value };
}

function template(partial) {
  return {
    name_template: "",
    description: "",
    is_blocking: true,
    enabled: true,
    launch_phase: "onEnter",
    launch_conditions: emptyCond,
    watchers: { type: "none" },
    sla: null,
    materials: [],
    field_access: emptyAccess(),
    actions: [],
    view_fields_placement: "afterSelect",
    ...partial,
  };
}

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
  if (!r.ok) throw new Error(`${r.status} ${path}: ${text.slice(0, 500)}`);
  return data;
}

async function ensureGeneralDirectorRole(token) {
  const usersEnt = await api(
    token,
    `entities?id=eq.${USERS}&select=definition`,
  );
  const userDef = usersEnt[0].definition;
  const roleField = userDef.fields.find((field) => field.id === USER_ROLE);
  if (
    roleField &&
    !(roleField.listOptions || []).some((option) => option.id === ROLE_GD)
  ) {
    roleField.listOptions = [
      ...(roleField.listOptions || []),
      {
        id: ROLE_GD,
        name: "Генеральный директор",
        color: "#a855f7",
        parentOptionId: null,
      },
    ];
    await api(token, `entities?id=eq.${USERS}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ definition: userDef }),
    });
  }

  const docs = await api(token, "app_documents?key=eq.roles&select=value");
  const value = docs[0]?.value || { roles: [] };
  const roles = Array.isArray(value.roles) ? [...value.roles] : [];
  if (!roles.some((role) => role.id === ROLE_GD)) {
    const employee =
      roles.find((role) => role.id === "role-system-employee") || {};
    roles.push({
      ...employee,
      id: ROLE_GD,
      name: "Генеральный директор",
      isSystem: false,
      description: "Единственный согласующий финальной версии ТКП",
    });
    await api(token, "app_documents?on_conflict=key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({
        key: "roles",
        value: { ...value, roles },
        updated_at: new Date().toISOString(),
      }),
    });
  }

  const people = await api(
    token,
    `entity_records?entity_id=eq.${USERS}&select=id,field_values`,
  );
  const holders = people.filter(
    (person) => person.field_values?.[USER_ROLE] === ROLE_GD,
  );
  const pickGd = () =>
    people.find(
      (person) => person.field_values?.[USER_EMAIL] === "gendir@centripk.ru",
    ) ||
    people.find(
      (person) => person.field_values?.[USER_EMAIL] === "test@test.ru",
    ) ||
    people.find(
      (person) => person.field_values?.[USER_ROLE] === "role-system-admin",
    ) ||
    people[0];

  if (holders.length === 0) {
    const gd = pickGd();
    if (gd) {
      await api(token, `entity_records?id=eq.${gd.id}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          field_values: { ...gd.field_values, [USER_ROLE]: ROLE_GD },
        }),
      });
      console.log("general director", gd.id);
    } else {
      console.log("WARN: no users to assign role-general-director");
    }
  } else if (holders.length > 1) {
    const preferred =
      holders.find(
        (person) => person.field_values?.[USER_EMAIL] === "gendir@centripk.ru",
      ) ||
      holders.find(
        (person) => person.field_values?.[USER_EMAIL] === "test@test.ru",
      ) ||
      holders[0];
    for (const extra of holders) {
      if (extra.id === preferred.id) continue;
      await api(token, `entity_records?id=eq.${extra.id}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          field_values: {
            ...extra.field_values,
            [USER_ROLE]: "role-system-admin",
          },
        }),
      });
    }
    console.log(
      "general director kept",
      preferred.id,
      "demoted",
      holders.length - 1,
    );
  }
}

async function main() {
  const signup = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `seed${Date.now()}@example.com`,
      password: "ScenarioBuilder1!",
    }),
  });
  const auth = await signup.json();
  const token = auth.access_token;
  if (!token) throw new Error(`auth failed: ${JSON.stringify(auth)}`);

  await ensureGeneralDirectorRole(token);

  const ents = await api(token, "entities?select=id,definition");
  const byId = Object.fromEntries(ents.map((e) => [e.id, e]));

  // ── 1) Schema: Lead + TKP + Расчёты отделов ─────────────────────────
  const leadDef = structuredClone(byId[LEAD].definition);
  const tkpDef = structuredClone(byId[TKP].definition);
  const protoDef = structuredClone(byId[PROTO].definition);
  const deptDef = structuredClone(byId[DEPT].definition);
  const protoStages = protoDef.fields.find((f) => f.id === F.protoStages);

  function ensureField(def, field) {
    const i = def.fields.findIndex((f) => f.id === field.id);
    if (i >= 0) def.fields[i] = { ...def.fields[i], ...field };
    else def.fields.push(field);
  }

  ensureField(
    leadDef,
    baseField({
      id: NEW.leadChief,
      name: "Главный инженер",
      type: "relation",
      relationEntityId: USERS,
      tableOrder: 6,
      required: true,
    }),
  );

  // «Воронка» was a fixed list — convert to relation catalog so choosing a
  // funnel can autofill «Главный инженер» via {{leadFunnel.funnelChief}}.
  const leadFunnelField = leadDef.fields.find((f) => f.id === F.leadFunnel);
  const funnelListOptions = structuredClone(leadFunnelField?.listOptions || []);
  ensureField(
    leadDef,
    baseField({
      id: F.leadFunnel,
      name: "Воронка",
      type: "relation",
      relationEntityId: NEW.funnelEntity,
      required: true,
      tableOrder: leadFunnelField?.tableOrder ?? 5,
      listOptions: [],
      listFixed: false,
      showOnCreate: leadFunnelField?.showOnCreate ?? true,
      showOnRecord: leadFunnelField?.showOnRecord ?? true,
    }),
  );
  ensureField(
    leadDef,
    baseField({
      id: NEW.leadGipComment,
      name: "Комментарий ГИПу",
      type: "textarea",
      tableOrder: 20,
    }),
  );
  ensureField(
    leadDef,
    baseField({
      id: NEW.leadRejectReason,
      name: "Причина отказа",
      type: "textarea",
      tableOrder: 21,
    }),
  );
  ensureField(
    leadDef,
    baseField({
      id: NEW.leadGipAssignDate,
      name: "Дата назначения ГИПа",
      type: "datetime",
      datetimeWithTime: false,
      tableOrder: 22,
    }),
  );

  // Department sphere → filter «Ведущий отдел» to production only.
  ensureField(
    deptDef,
    baseField({
      id: NEW.deptSphere,
      name: "Сфера",
      type: "list",
      tableOrder: 3,
      listFixed: true,
      listOptions: [
        {
          id: NEW.deptSphereProduction,
          name: "Производство",
          color: "#22c55e",
          parentOptionId: null,
        },
      ],
    }),
  );
  const protoLeadDeptField = protoDef.fields.find(
    (f) => f.id === F.protoLeadDept,
  );
  if (protoLeadDeptField) {
    protoLeadDeptField.relationFilter = {
      matches: [],
      conditions: [
        {
          id: "condition-proto-lead-dept-production",
          fieldId: NEW.deptSphere,
          operator: "in",
          values: [NEW.deptSphereProduction],
        },
      ],
    };
  }

  // New leads stay in «Черновик». Steps 2–3 spawn only after a manual
  // move into «Принятие решения» (reject from step 3 returns to draft).
  const leadStageField = leadDef.fields.find((f) => f.id === F.leadStage);
  if (leadStageField) {
    leadStageField.defaultValue = {
      kind: "value",
      value: LEAD_STAGE.draft,
    };
  }

  // Level 0 of relationGroups must be kind:"entity" (settings + runtime).
  // Catalog «Стадии проекта» uses the same ids as protocol list options.
  const STAGES_ENTITY = "entity-project-stages-seed";
  const STAGES_NAME = "field-project-stages-name-seed";
  const tkpStagesFieldId = "field-tkp-project-stages-seed";

  ensureField(
    tkpDef,
    baseField({
      id: NEW.tkpGroups,
      name: "Стадия/отделы",
      type: "relationGroups",
      tableOrder: 10,
      required: true,
      relationGroups: {
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
            displayFieldIds: [F.deptHead],
            defaultIds: [],
            layout: "column",
          },
        ],
      },
    }),
  );
  // Legacy multi-list kept for sync/compat; hidden — roots live in groups.
  ensureField(
    tkpDef,
    baseField({
      id: tkpStagesFieldId,
      name: "Стадии проекта",
      type: "list",
      listMultiple: true,
      listOptions: structuredClone(protoStages?.listOptions || []),
      tableOrder: 9,
      showOnCreate: false,
      showOnRecord: false,
    }),
  );

  ensureField(
    tkpDef,
    baseField({
      id: NEW.tkpCalcDeadline,
      name: "Срок расчёта",
      type: "datetime",
      datetimeWithTime: true,
      required: true,
      tableOrder: 11,
    }),
  );
  ensureField(
    tkpDef,
    baseField({
      id: NEW.tkpHeadsComment,
      name: "Комментарий руководителям",
      type: "textarea",
      tableOrder: 12,
    }),
  );

  // Default TKP status = Создано. «Выбор отделов» is a later stage (step 6).
  const statusField = tkpDef.fields.find((f) => f.id === F.tkpStatus);
  if (statusField) {
    statusField.defaultValue = {
      kind: "value",
      value: TKP_STAGE.created,
    };
    const createdIdx = (statusField.listOptions || []).findIndex(
      (option) => option.id === TKP_STAGE.created,
    );
    if (
      !(statusField.listOptions || []).some(
        (option) => option.id === TKP_STAGE.selectDepts,
      )
    ) {
      const option = {
        id: TKP_STAGE.selectDepts,
        name: "Выбор отделов",
        color: "#6366f1",
      };
      const options = [...(statusField.listOptions || [])];
      options.splice(createdIdx >= 0 ? createdIdx + 1 : 1, 0, option);
      statusField.listOptions = options;
    }
  }

  const deptCalcDef = {
    id: NEW.deptCalcEntity,
    name: "Расчёты отделов",
    namePlural: "Расчёты отделов",
    icon: "calculator",
    fields: [
      baseField({
        id: NEW.deptCalcName,
        name: "Название",
        type: "text",
        required: true,
        locked: true,
        tableOrder: 1,
        colSpan: 4,
      }),
      baseField({
        id: NEW.deptCalcParent,
        name: "Разбор ТКП",
        type: "relation",
        relationEntityId: TKP,
        required: true,
        tableOrder: 2,
      }),
      baseField({
        id: NEW.deptCalcGroups,
        name: "Стадия/отделы",
        type: "relationGroups",
        tableOrder: 3,
        relationGroups: {
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
              source: { kind: "entity", entityId: DEPT, limitFieldId: null },
              displayFieldIds: [F.deptHead],
              defaultIds: [],
              layout: "column",
            },
          ],
        },
      }),
      baseField({
        id: NEW.deptCalcManager,
        name: "Руководитель",
        type: "relation",
        relationEntityId: USERS,
        tableOrder: 4,
      }),
      baseField({
        id: NEW.deptCalcPerformer,
        name: "Исполнитель",
        type: "relation",
        relationEntityId: USERS,
        tableOrder: 5,
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

  if (!tkpDef.tabs.some((t) => t.id === NEW.tkpDeptTab)) {
    tkpDef.tabs.push({
      id: NEW.tkpDeptTab,
      kind: "entity",
      name: "Расчёты отделов",
      locked: false,
      sourceTabId: null,
      singleRecord: false,
      defaultFolders: [],
      linkedEntityId: NEW.deptCalcEntity,
      parentLinkFieldId: NEW.deptCalcParent,
      sourceRelationFieldId: null,
    });
  }

  await api(token, `entities?id=eq.${LEAD}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ definition: leadDef }),
  });
  console.log("updated Lead fields");

  await api(token, `entities?id=eq.${DEPT}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ definition: deptDef }),
  });
  await api(token, `entities?id=eq.${PROTO}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ definition: protoDef }),
  });
  console.log("updated Отдел sphere + Протокол lead-dept filter");

  const DEPT_NAME = "field-3c5803f4-9bbe-4749-868c-ed0e13497252";
  const NON_PRODUCTION = new Set([
    "Администрация ЦИПК",
    "Финансовый отдел",
    "Юридический отдел",
    "Служба безопасности",
    "Отдел директора",
    "Отдел бухгалтера",
    "Отдел КДП",
    "Коммерческий отдел",
    "Отдел ЛИНК",
    "Отдел по работе с подрядчиками",
    "Отдел оптимизации",
  ]);
  const deptRows = await api(
    token,
    `entity_records?entity_id=eq.${DEPT}&select=id,field_values`,
  );
  for (const row of deptRows || []) {
    const name = String(row.field_values?.[DEPT_NAME] || "").trim();
    const nextValues = { ...(row.field_values || {}) };
    if (NON_PRODUCTION.has(name)) {
      if (nextValues[NEW.deptSphere]) {
        delete nextValues[NEW.deptSphere];
        await api(token, `entity_records?id=eq.${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: JSON.stringify({ field_values: nextValues }),
        });
      }
      continue;
    }
    if (nextValues[NEW.deptSphere] === NEW.deptSphereProduction) continue;
    nextValues[NEW.deptSphere] = NEW.deptSphereProduction;
    await api(token, `entity_records?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ field_values: nextValues }),
    });
  }
  console.log("marked production departments");

  // Upsert stages catalog (ids = protocol list option ids)
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
  if (ents.find((e) => e.id === STAGES_ENTITY)) {
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
  for (const opt of protoStages?.listOptions || []) {
    const existing = await api(
      token,
      `entity_records?id=eq.${encodeURIComponent(opt.id)}&select=id`,
    );
    const payload = {
      id: opt.id,
      entity_id: STAGES_ENTITY,
      field_values: { [STAGES_NAME]: String(opt.name || "").trim() || opt.id },
    };
    if (existing?.length) {
      await api(token, `entity_records?id=eq.${encodeURIComponent(opt.id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          entity_id: STAGES_ENTITY,
          field_values: payload.field_values,
        }),
      });
    } else {
      await api(token, "entity_records", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify(payload),
      });
    }
  }
  console.log("upserted Стадии проекта catalog");

  // Upsert «Воронка» catalog (ids = former list option ids) + chief link
  const funnelDef = {
    id: NEW.funnelEntity,
    name: "Воронка",
    namePlural: "Воронки",
    icon: "git-branch",
    fields: [
      baseField({
        id: NEW.funnelName,
        name: "Название",
        type: "text",
        required: true,
        locked: true,
        tableOrder: 1,
        colSpan: 4,
      }),
      baseField({
        id: NEW.funnelChief,
        name: "Главный инженер",
        type: "relation",
        relationEntityId: USERS,
        required: true,
        tableOrder: 2,
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
  if (ents.find((e) => e.id === NEW.funnelEntity)) {
    await api(token, `entities?id=eq.${NEW.funnelEntity}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ definition: funnelDef }),
    });
  } else {
    await api(token, "entities", {
      method: "POST",
      body: JSON.stringify({ id: NEW.funnelEntity, definition: funnelDef }),
    });
  }
  const userRows = await api(
    token,
    `entity_records?entity_id=eq.${USERS}&select=id,field_values`,
  );
  const defaultChiefId = (userRows || [])[0]?.id || "";
  for (const opt of funnelListOptions) {
    const existing = await api(
      token,
      `entity_records?id=eq.${encodeURIComponent(opt.id)}&select=id,field_values`,
    );
    const prev = existing?.[0]?.field_values || {};
    const chief = String(prev[NEW.funnelChief] || "").trim() || defaultChiefId;
    const payload = {
      id: opt.id,
      entity_id: NEW.funnelEntity,
      field_values: {
        [NEW.funnelName]: String(opt.name || "").trim() || opt.id,
        ...(chief ? { [NEW.funnelChief]: chief } : {}),
      },
    };
    if (existing?.length) {
      await api(token, `entity_records?id=eq.${encodeURIComponent(opt.id)}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({
          entity_id: NEW.funnelEntity,
          field_values: payload.field_values,
        }),
      });
    } else {
      await api(token, "entity_records", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify(payload),
      });
    }
  }
  console.log("upserted Воронка catalog", funnelListOptions.length);

  // Upsert dept calc entity
  const existingDept = ents.find((e) => e.id === NEW.deptCalcEntity);
  if (existingDept) {
    await api(token, `entities?id=eq.${NEW.deptCalcEntity}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ definition: deptCalcDef }),
    });
  } else {
    await api(token, "entities", {
      method: "POST",
      body: JSON.stringify({ id: NEW.deptCalcEntity, definition: deptCalcDef }),
    });
  }
  console.log("upserted Расчёты отделов");

  await api(token, `entities?id=eq.${TKP}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ definition: tkpDef }),
  });
  console.log("updated Разбор ТКП fields/tabs");

  // Disable unused funnel process
  await api(token, `automation_processes?id=eq.${LEAD_FUNNEL_PROC}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ enabled: false }),
  });

  // ── 2) Clear old stub templates on lead/tkp scenarios ───────────────
  const old = await api(
    token,
    `automation_task_templates?scenario_id=in.(${LEAD_SCEN},${TKP_SCEN})&select=id`,
  );
  for (const t of old || []) {
    await api(token, `automation_task_templates?id=eq.${t.id}`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
  }
  console.log("cleared", old?.length || 0, "old templates");

  // ── 3) Lead templates (steps 2–5) ───────────────────────────────────
  const leadTemplates = [];

  // Step 2
  leadTemplates.push(
    template({
      id: "atpl-lead-fill-required",
      scenario_id: LEAD_SCEN,
      name: "Заполнить обязательные поля в лиде",
      name_template: `{{${F.leadName}}}_Заполнить обязательные поля в лиде`,
      trigger_option_id: LEAD_STAGE.decision,
      step_order: 0,
      kind: "single",
      assignee: { type: "field", fieldId: F.leadManager },
      actions: [
        setField(NEW.leadChief, `{{${F.leadFunnel}.${NEW.funnelChief}}}`),
      ],
      outcomes: [
        outcome("Готово", "#22c55e", [], {
          ...emptyAccess(),
          visibleFieldIds: [
            F.leadCounterparty,
            F.leadContact,
            F.leadFunnel,
            F.leadDeadline,
            F.leadLegal,
            NEW.leadChief,
            F.leadComment,
          ],
          requiredFieldIds: [
            F.leadCounterparty,
            F.leadContact,
            F.leadFunnel,
            F.leadDeadline,
            F.leadLegal,
            NEW.leadChief,
          ],
        }),
      ],
    }),
  );

  // Step 3 — chief engineer decision
  leadTemplates.push(
    template({
      id: "atpl-lead-chief-decision",
      scenario_id: LEAD_SCEN,
      name: "Принятие решения Главным инженером",
      name_template: `{{${F.leadName}}}_Принятие решения Главным инженером`,
      trigger_option_id: LEAD_STAGE.decision,
      step_order: 1,
      kind: "decision",
      assignee: { type: "field", fieldId: NEW.leadChief },
      sla: { hours: 24, calendar: "247" },
      field_access: {
        ...emptyAccess(),
        requireTimeTracking: true,
      },
      outcomes: [
        outcome(
          "Берем в работу",
          "#22c55e",
          [
            {
              id: uid("aact"),
              kind: "createRecord",
              entityId: TKP,
              mappings: [
                {
                  targetFieldId: F.tkpLead,
                  source: `{{${"__triggerRecordId__"}}}`,
                },
                {
                  targetFieldId: F.tkpStatus,
                  source: TKP_STAGE.created,
                },
                {
                  targetFieldId: F.tkpName,
                  source: `{{${F.leadName}}}`,
                },
              ],
              askFieldIds: [],
              multiple: false,
            },
            // Если протокол уже есть (SQL / прошлый шаг) — прикрепить к разбору.
            {
              id: uid("aact"),
              kind: "updateRecords",
              entityId: PROTO,
              linkMode: "backRelation",
              linkFieldId: F.protoLead,
              mappings: [
                {
                  targetFieldId: F.protoTkp,
                  source: "{{created}}",
                },
              ],
            },
            // Иначе создать протокол во вкладке «Разборы ТКП» + к лиду
            // (reuse, если протокол уже на лиде).
            {
              id: uid("aact"),
              kind: "createRecord",
              entityId: PROTO,
              mappings: [
                {
                  targetFieldId: F.protoName,
                  source: `{{${F.leadName}}}`,
                },
              ],
              parentFromRelated: [{ linkedTabId: F.leadTkpTab }],
              alsoLinkTrigger: true,
              askFieldIds: [],
              multiple: true,
            },
            setField(F.leadStage, LEAD_STAGE.gipLeadDept),
          ],
          {
            ...emptyAccess(),
            visibleFieldIds: [
              F.leadGip,
              NEW.leadGipComment,
              NEW.leadGipAssignDate,
            ],
            requiredFieldIds: [
              F.leadGip,
              NEW.leadGipComment,
              NEW.leadGipAssignDate,
            ],
          },
        ),
        returnOutcome(
          "Не берем в работу",
          "#ef4444",
          [setField(F.leadStage, LEAD_STAGE.draft)],
          NEW.leadRejectReason,
        ),
      ],
    }),
  );

  // Step 4 — GIP choose leading dept (protocol fields via related ask)
  leadTemplates.push(
    template({
      id: "atpl-lead-choose-lead-dept",
      scenario_id: LEAD_SCEN,
      name: "Выбрать ведущий отдел для работы с лидом",
      name_template: `{{${F.leadName}}}_Выбрать ведущий отдел для работы с лидом`,
      trigger_option_id: LEAD_STAGE.gipLeadDept,
      step_order: 0,
      kind: "single",
      assignee: { type: "field", fieldId: F.leadGip },
      sla: { hours: 24, calendar: "247" },
      field_access: { ...emptyAccess(), requireTimeTracking: true },
      outcomes: [
        outcome(
          "Заполнить данные",
          "#22c55e",
          [
            // Стадии с протокола → корни «Стадия/отделы» на ТКП
            // (отделы дозаполняет задание выбора руководителей).
            {
              id: uid("aact"),
              kind: "updateRecords",
              entityId: TKP,
              linkMode: "backRelation",
              linkFieldId: F.tkpLead,
              mappings: [
                {
                  targetFieldId: NEW.tkpGroups,
                  source: `{{tab:${F.leadProtoTab}.${F.protoStages}}}`,
                },
              ],
            },
          ],
          askAccess([
            {
              id: "rel-proto-dept",
              linkedTabId: F.leadProtoTab,
              relationFieldId: "",
              fieldId: F.protoLeadDept,
              required: true,
            },
            {
              id: "rel-proto-stages",
              linkedTabId: F.leadProtoTab,
              relationFieldId: "",
              fieldId: F.protoStages,
              required: true,
            },
            {
              id: "rel-proto-gip-desc",
              linkedTabId: F.leadProtoTab,
              relationFieldId: "",
              fieldId: F.protoGipDesc,
              required: true,
            },
          ]),
        ),
      ],
    }),
  );

  // Step 5 — leading dept head
  leadTemplates.push(
    template({
      id: "atpl-lead-dept-head-tz",
      scenario_id: LEAD_SCEN,
      name: "Ознакомиться с ТЗ и заполнить шаблон запуска проекта",
      name_template: `{{${F.leadName}}}_Ознакомиться с ТЗ и заполнить шаблон запуска проекта`,
      trigger_option_id: LEAD_STAGE.gipLeadDept,
      step_order: 1,
      kind: "single",
      assignee: {
        type: "relatedField",
        linkedChild: {
          tabId: F.leadProtoTab,
          entityId: PROTO,
          parentFieldId: F.protoLead,
        },
        relationFieldId: F.protoLeadDept,
        fieldId: F.deptHead,
        fanOut: false,
      },
      field_access: { ...emptyAccess(), requireTimeTracking: true },
      outcomes: [
        outcome(
          "Выполнено",
          "#22c55e",
          [
            {
              id: "aact-view-proto-gip-desc",
              kind: "viewField",
              fieldIds: [],
              relatedFields: [
                {
                  id: "rel-proto-gip-ro",
                  linkedTabId: F.leadProtoTab,
                  relationFieldId: "",
                  fieldId: F.protoGipDesc,
                },
              ],
            },
            setField(F.leadStage, LEAD_STAGE.gipFilling),
            {
              id: uid("aact"),
              kind: "updateRecords",
              entityId: TKP,
              linkMode: "backRelation",
              linkFieldId: F.tkpLead,
              mappings: [
                {
                  targetFieldId: F.tkpStatus,
                  source: TKP_STAGE.selectDepts,
                },
              ],
            },
          ],
          askAccess([
            {
              id: "rel-proto-dept-desc",
              linkedTabId: F.leadProtoTab,
              relationFieldId: "",
              fieldId: F.protoDeptDesc,
              required: true,
            },
          ]),
        ),
      ],
    }),
  );

  // ── 4) TKP templates (steps 6–12) ───────────────────────────────────
  const tkpTemplates = [];

  // Step 6 — only after step 5 moves Разбор with «Создано» → «Выбор отделов».
  tkpTemplates.push(
    template({
      id: "atpl-tkp-select-dept-heads",
      scenario_id: TKP_SCEN,
      name: "Выбрать руководителей отделов для расчета трудозатрат по лиду",
      name_template: `{{${F.tkpName}}}_Выбрать руководителей отделов для расчета трудозатрат по лиду`,
      trigger_option_id: TKP_STAGE.selectDepts,
      step_order: 0,
      kind: "single",
      assignee: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        fieldId: F.leadGip,
        fanOut: false,
      },
      field_access: { ...emptyAccess(), requireTimeTracking: true },
      outcomes: [
        outcome(
          "Готово",
          "#22c55e",
          [
            // Rows «Расчёты отделов» are written by the stage-spawn hook
            // before this setField, so step 7 resolves assignees.
            setField(F.tkpStatus, TKP_STAGE.depts),
            {
              id: uid("aact"),
              kind: "updateRecords",
              entityId: LEAD,
              linkMode: "relation",
              linkFieldId: F.tkpLead,
              mappings: [
                {
                  targetFieldId: F.leadStage,
                  source: LEAD_STAGE.tkpCalc,
                },
              ],
            },
          ],
          {
            ...emptyAccess(),
            visibleFieldIds: [
              NEW.tkpGroups,
              NEW.tkpCalcDeadline,
              NEW.tkpHeadsComment,
            ],
            requiredFieldIds: [
              NEW.tkpGroups,
              NEW.tkpCalcDeadline,
              NEW.tkpHeadsComment,
            ],
            // Стадии уже с лида/протокола — на ТКП только отделы.
            fieldAskOptions: {
              [NEW.tkpGroups]: { relationGroupsMode: "nested" },
            },
          },
        ),
      ],
    }),
  );

  // Step 7 — dept calc parallel
  tkpTemplates.push(
    template({
      id: "atpl-tkp-dept-calc",
      scenario_id: TKP_SCEN,
      name: "Заполнить разбор ТКП",
      name_template: `{{${F.tkpName}}}_Заполнить разбор ТКП`,
      trigger_option_id: TKP_STAGE.depts,
      step_order: 0,
      kind: "decision",
      assignee: {
        type: "relatedField",
        linkedChild: {
          tabId: NEW.tkpDeptTab,
          entityId: NEW.deptCalcEntity,
          parentFieldId: NEW.deptCalcParent,
        },
        relationFieldId: "",
        fieldId: NEW.deptCalcManager,
        fanOut: true,
        completeWhen: "all",
      },
      sla: { hours: 4, calendar: "247" },
      field_access: deptCalcAsk(false),
      outcomes: [
        outcome("Готово", "#22c55e", [], deptCalcAsk(true)),
        outcome("Нет объёмов", "#f59e0b", []),
      ],
    }),
  );

  // After all dept calcs — autofill move to GIP fill (sequential gate via completeWhen)
  tkpTemplates.push(
    template({
      id: "atpl-tkp-after-depts-advance",
      scenario_id: TKP_SCEN,
      name: "Переход к расчёту ГИПа",
      trigger_option_id: TKP_STAGE.depts,
      step_order: 1,
      kind: "actions",
      is_blocking: false,
      assignee: { type: "none" },
      outcomes: [
        outcome("Авто", null, [setField(F.tkpStatus, TKP_STAGE.gipFill)]),
      ],
    }),
  );

  // Step 8 — GIP final calc
  tkpTemplates.push(
    template({
      id: "atpl-tkp-gip-final",
      scenario_id: TKP_SCEN,
      name: "Проверить и утвердить итоговый расчет ТКП",
      name_template: `{{${F.tkpName}}}_Проверить и утвердить итоговый расчет ТКП`,
      trigger_option_id: TKP_STAGE.gipFill,
      step_order: 0,
      kind: "single",
      assignee: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        fieldId: F.leadGip,
      },
      sla: { hours: 4, calendar: "247" },
      field_access: { ...emptyAccess(), requireTimeTracking: true },
      outcomes: [
        outcome("Готово", "#22c55e", [
          setField(F.tkpStatus, TKP_STAGE.chiefApprove),
        ]),
      ],
    }),
  );

  // Step 9 — chief engineer approve
  tkpTemplates.push(
    template({
      id: "atpl-tkp-chief-approve",
      scenario_id: TKP_SCEN,
      name: "Согласовать итоговый расчет по лиду",
      name_template: `{{${F.tkpName}}}_Согласовать итоговый расчет по лиду`,
      trigger_option_id: TKP_STAGE.chiefApprove,
      step_order: 0,
      kind: "decision",
      assignee: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        fieldId: NEW.leadChief,
      },
      sla: { hours: 2, calendar: "247" },
      field_access: { ...emptyAccess(), requireTimeTracking: true },
      outcomes: [
        outcome("Согласовано", "#22c55e", [
          setField(F.tkpStatus, TKP_STAGE.price),
        ]),
        returnOutcome(
          "Не согласовано",
          "#ef4444",
          [setField(F.tkpStatus, TKP_STAGE.gipFill)],
          // → «Проверить и утвердить итоговый расчет ТКП» у ГИПа лида
          NEW.tkpHeadsComment,
        ),
      ],
    }),
  );

  // Step 10–11 — manager form TKP
  tkpTemplates.push(
    template({
      id: "atpl-tkp-form-commercial",
      scenario_id: TKP_SCEN,
      name: "Сформировать ТКП",
      name_template: `{{${F.tkpName}}}_Сформировать ТКП`,
      trigger_option_id: TKP_STAGE.price,
      step_order: 0,
      kind: "single",
      assignee: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        fieldId: F.leadManager,
      },
      sla: { hours: 2, calendar: "247" },
      field_access: { ...emptyAccess(), requireTimeTracking: true },
      outcomes: [
        outcome("Готово", "#22c55e", [
          setField(F.tkpStatus, TKP_STAGE.approveGip),
        ]),
      ],
    }),
  );

  // 12.1 GIP approve doc
  tkpTemplates.push(
    template({
      id: "atpl-tkp-approve-gip",
      scenario_id: TKP_SCEN,
      name: "Согласовать ТКП — ГИП",
      name_template: `{{${F.tkpName}}}_Согласовать ТКП — ГИП`,
      trigger_option_id: TKP_STAGE.approveGip,
      step_order: 0,
      kind: "decision",
      assignee: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        fieldId: F.leadGip,
      },
      outcomes: [
        outcome("Согласовать", "#22c55e", [
          setField(F.tkpStatus, TKP_STAGE.approveRko),
        ]),
        returnOutcome(
          "Вернуть менеджеру",
          "#ef4444",
          // → «Сформировать ТКП» у менеджера лида
          [setField(F.tkpStatus, TKP_STAGE.price)],
          NEW.tkpHeadsComment,
        ),
      ],
    }),
  );

  // 12.2 — руководитель отдела менеджера лида (ТКП → лид → менеджер → отдел → рук.).
  tkpTemplates.push(
    template({
      id: "atpl-tkp-approve-rko",
      scenario_id: TKP_SCEN,
      name: "Согласовать ТКП — Руководитель отдела менеджера",
      name_template: `{{${F.tkpName}}}_Согласовать ТКП — Руководитель отдела менеджера`,
      trigger_option_id: TKP_STAGE.approveRko,
      step_order: 0,
      kind: "decision",
      assignee: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        via: [F.leadManager, USER_DEPT],
        fieldId: F.deptHead,
      },
      outcomes: [
        outcome("Согласовать", "#22c55e", [
          setField(F.tkpStatus, TKP_STAGE.approveGd),
        ]),
        returnOutcome(
          "Вернуть менеджеру",
          "#ef4444",
          [setField(F.tkpStatus, TKP_STAGE.price)],
          NEW.tkpHeadsComment,
        ),
      ],
    }),
  );

  // 12.3 — ровно один пользователь с ролью «Генеральный директор».
  tkpTemplates.push(
    template({
      id: "atpl-tkp-approve-gd",
      scenario_id: TKP_SCEN,
      name: "Согласовать ТКП — Генеральный директор",
      name_template: `{{${F.tkpName}}}_Согласовать ТКП — Генеральный директор`,
      trigger_option_id: TKP_STAGE.approveGd,
      step_order: 0,
      kind: "decision",
      assignee: { type: "role", roleId: ROLE_GD, completeWhen: "any" },
      outcomes: [
        outcome("Согласовать", "#22c55e", [
          setField(F.tkpStatus, TKP_STAGE.readySend),
        ]),
        returnOutcome(
          "Вернуть менеджеру",
          "#ef4444",
          [setField(F.tkpStatus, TKP_STAGE.price)],
          NEW.tkpHeadsComment,
        ),
      ],
    }),
  );

  // Step 13 — manager confirms send
  tkpTemplates.push(
    template({
      id: "atpl-tkp-send-customer",
      scenario_id: TKP_SCEN,
      name: "Зафиксировать отправку заказчику",
      name_template: `{{${F.tkpName}}}_Зафиксировать отправку заказчику`,
      trigger_option_id: TKP_STAGE.readySend,
      step_order: 0,
      kind: "single",
      assignee: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        fieldId: F.leadManager,
      },
      outcomes: [
        outcome("Отправлено", "#22c55e", [
          setField(F.tkpStatus, TKP_STAGE.sent),
          {
            id: uid("aact"),
            kind: "updateRecords",
            entityId: LEAD,
            linkMode: "relation",
            linkFieldId: F.tkpLead,
            mappings: [
              { targetFieldId: F.leadStage, source: LEAD_STAGE.customer },
            ],
          },
        ]),
      ],
    }),
  );

  // ── 5) Scenario release modes + transitions ─────────────────────────
  await api(token, `automation_scenarios?id=eq.${LEAD_SCEN}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      stage_task_release: {
        [LEAD_STAGE.decision]: "sequential",
        [LEAD_STAGE.gipLeadDept]: "sequential",
      },
      stage_transitions: [
        {
          id: uid("astr"),
          fromOptionId: LEAD_STAGE.draft,
          toOptionId: LEAD_STAGE.decision,
          elseOptionId: "",
          conditions: emptyCond,
        },
        {
          id: uid("astr"),
          fromOptionId: LEAD_STAGE.decision,
          toOptionId: LEAD_STAGE.gipLeadDept,
          elseOptionId: "",
          conditions: emptyCond,
        },
        {
          id: uid("astr"),
          fromOptionId: LEAD_STAGE.gipLeadDept,
          toOptionId: LEAD_STAGE.gipFilling,
          elseOptionId: "",
          conditions: emptyCond,
        },
        {
          id: uid("astr"),
          fromOptionId: LEAD_STAGE.gipFilling,
          toOptionId: LEAD_STAGE.tkpCalc,
          elseOptionId: "",
          conditions: emptyCond,
        },
        {
          id: uid("astr"),
          fromOptionId: LEAD_STAGE.tkpCalc,
          toOptionId: LEAD_STAGE.customer,
          elseOptionId: "",
          conditions: emptyCond,
        },
        {
          id: uid("astr"),
          fromOptionId: LEAD_STAGE.customer,
          toOptionId: LEAD_STAGE.recalc,
          elseOptionId: "",
          conditions: emptyCond,
        },
      ],
      updated_at: new Date().toISOString(),
    }),
  });

  const tkpLinear = [
    TKP_STAGE.created,
    TKP_STAGE.selectDepts,
    TKP_STAGE.depts,
    TKP_STAGE.gipFill,
    TKP_STAGE.chiefApprove,
    TKP_STAGE.price,
    TKP_STAGE.approveGip,
    TKP_STAGE.approveRko,
    TKP_STAGE.approveGd,
    TKP_STAGE.readySend,
    TKP_STAGE.sent,
  ];
  await api(token, `automation_scenarios?id=eq.${TKP_SCEN}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      stage_task_release: {
        [TKP_STAGE.created]: "sequential",
        [TKP_STAGE.selectDepts]: "sequential",
        // sequential so step_order 1 (advance) waits for fanOut completeWhen:all
        [TKP_STAGE.depts]: "sequential",
        [TKP_STAGE.gipFill]: "sequential",
        [TKP_STAGE.chiefApprove]: "sequential",
        [TKP_STAGE.price]: "sequential",
        [TKP_STAGE.approveGip]: "sequential",
        [TKP_STAGE.approveRko]: "sequential",
        [TKP_STAGE.approveGd]: "sequential",
        [TKP_STAGE.readySend]: "sequential",
      },
      stage_transitions: tkpLinear.slice(0, -1).map((from, index) => ({
        id: uid("astr"),
        fromOptionId: from,
        toOptionId: tkpLinear[index + 1],
        elseOptionId: "",
        conditions: emptyCond,
      })),
      updated_at: new Date().toISOString(),
    }),
  });

  // TKP → лид. Затем протокол: update существующий / create во вкладке разбора.
  const step3 = leadTemplates.find((t) => t.id === "atpl-lead-chief-decision");
  step3.outcomes[0].actions = [
    {
      id: uid("aact"),
      kind: "createRecord",
      entityId: TKP,
      mappings: [
        { targetFieldId: F.tkpStatus, source: TKP_STAGE.created },
        { targetFieldId: F.tkpName, source: `{{${F.leadName}}}` },
      ],
      askFieldIds: [],
      multiple: false,
    },
    {
      id: uid("aact"),
      kind: "updateRecords",
      entityId: PROTO,
      linkMode: "backRelation",
      linkFieldId: F.protoLead,
      mappings: [{ targetFieldId: F.protoTkp, source: "{{created}}" }],
    },
    {
      id: uid("aact"),
      kind: "createRecord",
      entityId: PROTO,
      mappings: [{ targetFieldId: F.protoName, source: `{{${F.leadName}}}` }],
      parentFromRelated: [{ linkedTabId: F.leadTkpTab }],
      alsoLinkTrigger: true,
      askFieldIds: [],
      multiple: true,
    },
    setField(F.leadStage, LEAD_STAGE.gipLeadDept),
  ];

  const allTemplates = [...leadTemplates, ...tkpTemplates];

  for (const t of allTemplates) {
    await api(token, "automation_task_templates?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify(t),
    });
    console.log("template", t.id, t.name);
  }

  // Notification: GIP on dept calc complete
  const notifRules = [
    {
      id: "anr-dept-calc-done",
      template_id: "atpl-tkp-dept-calc",
      event: "completed",
      recipients: {
        type: "relatedField",
        relationFieldId: F.tkpLead,
        fieldId: F.leadGip,
      },
      conditions: emptyCond,
      message_template: "Отдел завершил расчёт по «{{name}}» — {{outcome}}",
    },
  ];
  for (const rule of notifRules) {
    await api(token, "automation_notification_rules?on_conflict=id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify(rule),
    });
  }

  const check = await api(
    token,
    `automation_task_templates?scenario_id=in.(${LEAD_SCEN},${TKP_SCEN})&select=id,name,kind,trigger_option_id,step_order,enabled&order=step_order`,
  );
  writeFileSync(
    join(root, "scripts/lead-tkp-inventory/seed-result.json"),
    JSON.stringify({ templates: check, newFields: NEW }, null, 2),
  );
  console.log("\nDONE templates:", check.length);
  for (const t of check) {
    console.log(
      `  [${t.step_order}] ${t.kind} ${t.name} @ ${t.trigger_option_id}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
