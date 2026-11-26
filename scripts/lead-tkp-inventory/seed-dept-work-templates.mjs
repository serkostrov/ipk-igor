/**
 * Seed «Шаблоны работ» (B9) + «Подзадачи отдела» lines under «Расчёты отделов» (B11).
 * Idempotent: merge-patches existing definitions; does not wipe unrelated fields.
 *
 * Usage: node scripts/lead-tkp-inventory/seed-dept-work-templates.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const envText = readFileSync(join(root, ".env"), "utf8");
const URL = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const KEY = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!URL || !KEY) throw new Error("Missing .env supabase vars");

const DEPT = "entity-8e7a618c-64f8-4385-a8d7-302e29161701";
const DEPT_NAME = "field-3c5803f4-9bbe-4749-868c-ed0e13497252";
const DEPT_HEAD = "field-640540ba-4b47-4e22-8270-b4bfbff081fd";
const DEPT_RATE = "field-dept-rate-seed";

const DEPT_CALC = "entity-dept-calculations-seed";
const TKP = "entity-33de9416-88f2-4360-9f96-9c71d0886fbc";
const STAGES = "entity-project-stages-seed";
const STAGES_NAME = "field-project-stages-name-seed";
const USERS = "entity-system-users";

const WORK = "entity-work-templates-seed";
const LINES = "entity-dept-calc-lines-seed";

const IDS = {
  // Отдел
  deptRate: DEPT_RATE,
  // Шаблоны работ
  workName: "field-worktpl-name-seed",
  workDept: "field-worktpl-dept-seed",
  workCalcType: "field-worktpl-calc-type-seed",
  workCategory: "field-worktpl-category-seed",
  workTaxStatus: "field-worktpl-tax-status-seed",
  workTax: "field-worktpl-tax-seed",
  workCoeff: "field-worktpl-coeff-seed",
  workNeedFile: "field-worktpl-need-file-seed",
  workStage: "field-worktpl-stage-seed",
  workHint: "field-worktpl-hint-seed",
  workActive: "field-worktpl-active-seed",
  // Расчёты отделов (extra)
  dcDeadline: "field-deptcalc-deadline-seed",
  dcDescription: "field-deptcalc-description-seed",
  dcComment: "field-deptcalc-comment-seed",
  dcStatus: "field-deptcalc-status-seed",
  dcRate: "field-deptcalc-rate-seed",
  dcDept: "field-deptcalc-dept-seed",
  dcHoursRollup: "field-deptcalc-hours-rollup-seed",
  dcLaborRollup: "field-deptcalc-labor-rollup-seed",
  dcTotalRollup: "field-deptcalc-total-rollup-seed",
  dcLinesTab: "tab-deptcalc-lines-seed",
  // existing seed fields on dept calc
  dcName: "field-deptcalc-name-seed",
  dcParent: "field-deptcalc-parent-tkp-seed",
  dcGroups: "field-deptcalc-groups-seed",
  dcManager: "field-deptcalc-manager-seed",
  dcPerformer: "field-deptcalc-performer-seed",
  // Подзадачи отдела
  lineName: "field-deptline-name-seed",
  lineParent: "field-deptline-parent-seed",
  lineTemplate: "field-deptline-template-seed",
  lineDept: "field-deptline-dept-seed",
  lineCalcType: "field-deptline-calc-type-seed",
  lineHours: "field-deptline-hours-seed",
  lineSum: "field-deptline-sum-seed",
  lineRate: "field-deptline-rate-seed",
  lineCost: "field-deptline-cost-seed",
  lineCategory: "field-deptline-category-seed",
  lineTaxStatus: "field-deptline-tax-status-seed",
  lineTax: "field-deptline-tax-seed",
  lineCoeff: "field-deptline-coeff-seed",
  lineCostTax: "field-deptline-cost-tax-seed",
  lineCostCoeff: "field-deptline-cost-coeff-seed",
  lineComment: "field-deptline-comment-seed",
};

const OPT = {
  calcHours: "list-worktpl-calc-hours",
  calcSum: "list-worktpl-calc-sum",
  catLabor: "list-worktpl-cat-labor",
  catContract: "list-worktpl-cat-contract",
  catManager: "list-worktpl-cat-manager",
  catTravel: "list-worktpl-cat-travel",
  catSurvey: "list-worktpl-cat-survey",
  catExpertise: "list-worktpl-cat-expertise",
  catOtherCoeff: "list-worktpl-cat-other-coeff",
  catOtherPlain: "list-worktpl-cat-other-plain",
  taxSz: "list-worktpl-tax-sz",
  taxGph: "list-worktpl-tax-gph",
  taxIp: "list-worktpl-tax-ip",
  taxOoo: "list-worktpl-tax-ooo",
  stWait: "list-deptcalc-status-wait",
  stWork: "list-deptcalc-status-work",
  stApprove: "list-deptcalc-status-approve",
  stDone: "list-deptcalc-status-done",
  stRework: "list-deptcalc-status-rework",
  stReject: "list-deptcalc-status-reject",
};

const overviewTab = {
  id: "overview",
  kind: "fields",
  name: "Обзор",
  locked: true,
  tableFlat: false,
  sourceTabId: null,
  singleRecord: false,
  defaultFolders: [],
  linkedEntityId: null,
  parentLinkFieldId: null,
  sourceRelationFieldId: null,
};

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
    relationSpawnPerUser: false,
    listSourceFieldId: null,
    listShowEmptyValue: true,
    listDependsOnFieldId: null,
    visibilityConditions: [],
    ...partial,
  };
}

function listOpt(id, name, color, extra = {}) {
  return {
    id,
    name,
    color,
    parentOptionId: null,
    isFinal: false,
    isProblem: false,
    ...extra,
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
  if (!r.ok) throw new Error(`${r.status} ${path}: ${text.slice(0, 800)}`);
  return data;
}

function upsertField(fields, field) {
  const idx = fields.findIndex((item) => item.id === field.id);
  if (idx >= 0) {
    fields[idx] = { ...fields[idx], ...field };
  } else {
    fields.push(field);
  }
}

function ensureEntityShape(def, extras = {}) {
  return {
    views: ["table"],
    defaultView: null,
    fieldGroups: [],
    kanbanFieldId: null,
    kanbanCardFieldIds: null,
    kanbanShowFilters: true,
    tableMassSelection: false,
    tableParentFieldId: null,
    tableSubgroupFieldId: null,
    tableNestedEntityId: null,
    headerFieldId: null,
    systemKey: null,
    locked: false,
    parentEntityId: null,
    recordColumns: 2,
    recordsDisplay: "table",
    description: "",
    nameTemplate: "",
    timeTracking: null,
    timeline: null,
    pageLayout: null,
    createUpload: false,
    ...def,
    ...extras,
  };
}

async function upsertEntity(token, id, definition) {
  const existing = await api(token, `entities?id=eq.${id}&select=id`);
  const body = { id, definition };
  if (existing?.length) {
    await api(token, `entities?id=eq.${id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ definition }),
    });
  } else {
    await api(token, "entities", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify(body),
    });
  }
}

async function upsertRecord(token, id, entityId, fieldValues) {
  const existing = await api(
    token,
    `entity_records?id=eq.${encodeURIComponent(id)}&select=id`,
  );
  const payload = { entity_id: entityId, field_values: fieldValues };
  if (existing?.length) {
    await api(token, `entity_records?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify(payload),
    });
  } else {
    await api(token, "entity_records", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ id, ...payload }),
    });
  }
}

function calcTypeOptions() {
  return [
    listOpt(OPT.calcHours, "Часы", "#3b82f6"),
    listOpt(OPT.calcSum, "Сумма", "#14b8a6"),
  ];
}

function categoryOptions() {
  return [
    listOpt(OPT.catLabor, "Трудозатраты", "#6b7280"),
    listOpt(OPT.catContract, "Подрядные работы", "#a855f7"),
    listOpt(OPT.catManager, "Расходы менеджера", "#f59e0b"),
    listOpt(OPT.catTravel, "Командировочные расходы", "#f97316"),
    listOpt(OPT.catSurvey, "Изыскания", "#38bdf8"),
    listOpt(OPT.catExpertise, "Экспертиза", "#6366f1"),
    listOpt(OPT.catOtherCoeff, "Прочие с коэффициентом", "#ec4899"),
    listOpt(OPT.catOtherPlain, "Прочие без коэффициента", "#6b7280"),
  ];
}

function taxStatusOptions() {
  return [
    listOpt(OPT.taxSz, "СЗ", "#94a3b8"),
    listOpt(OPT.taxGph, "ГПХ", "#94a3b8"),
    listOpt(OPT.taxIp, "ИП", "#94a3b8"),
    listOpt(OPT.taxOoo, "ООО", "#94a3b8"),
  ];
}

function deptCalcStatusOptions() {
  return [
    listOpt(OPT.stWait, "Ожидание", "#6b7280"),
    listOpt(OPT.stWork, "В работе", "#3b82f6"),
    listOpt(OPT.stApprove, "На согласовании", "#f59e0b"),
    listOpt(OPT.stDone, "Согласован", "#22c55e", { isFinal: true }),
    listOpt(OPT.stRework, "Возвращён на доработку", "#f97316"),
    listOpt(OPT.stReject, "Отклонён", "#ef4444", { isFinal: true }),
  ];
}

function visibilityForCalcType(optionId) {
  return [
    {
      id: `condition-vis-${optionId}`,
      fieldId: IDS.lineCalcType,
      operator: "in",
      values: [optionId],
    },
  ];
}

function buildWorkTemplatesDef() {
  return ensureEntityShape({
    id: WORK,
    name: "Шаблон работ",
    namePlural: "Шаблоны работ",
    icon: "list",
    fields: [
      baseField({
        id: IDS.workName,
        name: "Название",
        type: "text",
        required: true,
        locked: true,
        tableOrder: 1,
        colSpan: 4,
      }),
      baseField({
        id: IDS.workDept,
        name: "Отдел",
        type: "relation",
        relationEntityId: DEPT,
        required: true,
        tableOrder: 2,
        showInFilters: true,
      }),
      baseField({
        id: IDS.workCalcType,
        name: "Тип расчёта",
        type: "list",
        required: true,
        tableOrder: 3,
        listOptions: calcTypeOptions(),
        defaultValue: { kind: "literal", value: OPT.calcHours },
      }),
      baseField({
        id: IDS.workCategory,
        name: "Категория расходов",
        type: "list",
        required: true,
        tableOrder: 4,
        listOptions: categoryOptions(),
        defaultValue: { kind: "literal", value: OPT.catLabor },
      }),
      baseField({
        id: IDS.workTaxStatus,
        name: "Налоговый статус",
        type: "list",
        tableOrder: 5,
        listUseColors: false,
        listOptions: taxStatusOptions(),
        visibilityConditions: [
          {
            id: "condition-work-tax-status",
            fieldId: IDS.workCategory,
            operator: "in",
            values: [OPT.catContract],
          },
        ],
      }),
      baseField({
        id: IDS.workTax,
        name: "Налог",
        type: "number",
        unitSuffix: "%",
        tableOrder: 6,
        decimals: 2,
        visibilityConditions: [
          {
            id: "condition-work-tax",
            fieldId: IDS.workCategory,
            operator: "in",
            values: [OPT.catContract],
          },
        ],
      }),
      baseField({
        id: IDS.workCoeff,
        name: "Коэффициент",
        type: "number",
        tableOrder: 7,
        decimals: 2,
        defaultValue: { kind: "literal", value: "1.2" },
        visibilityConditions: [
          {
            id: "condition-work-coeff",
            fieldId: IDS.workCategory,
            operator: "in",
            values: [
              OPT.catSurvey,
              OPT.catExpertise,
              OPT.catOtherCoeff,
              OPT.catContract,
            ],
          },
        ],
      }),
      baseField({
        id: IDS.workNeedFile,
        name: "Нужен файл результата",
        type: "boolean",
        tableOrder: 8,
        defaultValue: { kind: "literal", value: "true" },
      }),
      baseField({
        id: IDS.workStage,
        name: "Стадия",
        type: "relation",
        relationEntityId: STAGES,
        tableOrder: 9,
      }),
      baseField({
        id: IDS.workHint,
        name: "Подсказка",
        type: "textarea",
        tableOrder: 10,
        colSpan: 4,
        showInTable: false,
      }),
      baseField({
        id: IDS.workActive,
        name: "Активен",
        type: "boolean",
        tableOrder: 11,
        booleanInline: true,
        defaultValue: { kind: "literal", value: "true" },
      }),
    ],
    tabs: [overviewTab],
  });
}

function buildLinesDef() {
  return ensureEntityShape({
    id: LINES,
    name: "Подзадача отдела",
    namePlural: "Подзадачи отдела",
    icon: "list-tree",
    parentEntityId: DEPT_CALC,
    recordsDisplay: "table",
    nameTemplate: `{{${IDS.lineTemplate}}}`,
    fields: [
      baseField({
        id: IDS.lineName,
        name: "Название",
        type: "text",
        required: true,
        locked: true,
        tableOrder: 1,
        colSpan: 4,
      }),
      baseField({
        id: IDS.lineParent,
        name: "Расчёты отделов",
        type: "relation",
        relationEntityId: DEPT_CALC,
        required: true,
        tableOrder: 2,
        showInTable: false,
        showOnCreate: true,
      }),
      baseField({
        id: IDS.lineTemplate,
        name: "Шаблон",
        type: "relation",
        relationEntityId: WORK,
        required: true,
        tableOrder: 3,
        relationFilter: {
          matches: [
            {
              targetFieldId: IDS.workDept,
              sourceFieldId: IDS.lineDept,
            },
          ],
          conditions: [
            {
              id: "condition-worktpl-active",
              fieldId: IDS.workActive,
              operator: "true",
            },
          ],
        },
      }),
      baseField({
        id: IDS.lineDept,
        name: "Отдел",
        type: "relation",
        relationEntityId: DEPT,
        tableOrder: 4,
        showInTable: false,
      }),
      baseField({
        id: IDS.lineCalcType,
        name: "Тип расчёта",
        type: "list",
        required: true,
        tableOrder: 5,
        listOptions: calcTypeOptions(),
        defaultValue: { kind: "literal", value: OPT.calcHours },
      }),
      baseField({
        id: IDS.lineHours,
        name: "Часы",
        type: "number",
        unitSuffix: "ч",
        tableOrder: 6,
        required: true,
        visibilityConditions: visibilityForCalcType(OPT.calcHours),
      }),
      baseField({
        id: IDS.lineSum,
        name: "Сумма",
        type: "number",
        unitSuffix: "₽",
        tableOrder: 7,
        required: true,
        visibilityConditions: visibilityForCalcType(OPT.calcSum),
      }),
      baseField({
        id: IDS.lineRate,
        name: "Ставка",
        type: "lookup",
        tableOrder: 8,
        unitSuffix: "₽",
        lookup: {
          relationFieldId: IDS.lineParent,
          viaFieldId: IDS.dcDept,
          targetFieldId: IDS.deptRate,
        },
      }),
      baseField({
        id: IDS.lineCost,
        name: "Стоимость",
        type: "formula",
        unitSuffix: "₽",
        tableOrder: 9,
        includeInTotal: true,
        formula: {
          decimals: 2,
          // List operands resolve to the option name, not the option id.
          expression: `IF({{${IDS.lineCalcType}}} = "Часы"; {{${IDS.lineHours}}} * {{${IDS.lineRate}}}; {{${IDS.lineSum}}})`,
        },
      }),
      baseField({
        id: IDS.lineCategory,
        name: "Категория расходов",
        type: "list",
        tableOrder: 10,
        listOptions: categoryOptions(),
        hint: "Для подрядных работ обязательны налоговый статус и налог %",
      }),
      baseField({
        id: IDS.lineTaxStatus,
        name: "Налоговый статус",
        type: "list",
        tableOrder: 11,
        listUseColors: false,
        required: true,
        listOptions: taxStatusOptions(),
        hint: "ИП / СЗ / ГПХ — в базе FIX; ООО — после FIX с коэффициентом",
        visibilityConditions: [
          {
            id: "condition-line-tax-status",
            fieldId: IDS.lineCategory,
            operator: "in",
            values: [OPT.catContract],
          },
        ],
      }),
      baseField({
        id: IDS.lineTax,
        name: "Налог",
        type: "number",
        unitSuffix: "%",
        tableOrder: 12,
        decimals: 2,
        required: true,
        hint: "Ставка % к стоимости подрядной строки (учитывается в «Стоимость с налогом»)",
        visibilityConditions: [
          {
            id: "condition-line-tax",
            fieldId: IDS.lineCategory,
            operator: "in",
            values: [OPT.catContract],
          },
        ],
      }),
      baseField({
        id: IDS.lineCoeff,
        name: "Коэффициент",
        type: "number",
        tableOrder: 13,
        decimals: 2,
        defaultValue: { kind: "literal", value: "1.2" },
      }),
      baseField({
        id: IDS.lineCostTax,
        name: "Стоимость с налогом",
        type: "formula",
        unitSuffix: "₽",
        tableOrder: 14,
        formula: {
          decimals: 2,
          expression: `{{${IDS.lineCost}}} * (1 + {{${IDS.lineTax}}} / 100)`,
        },
      }),
      baseField({
        id: IDS.lineCostCoeff,
        name: "Сумма с коэффициентом",
        type: "formula",
        unitSuffix: "₽",
        tableOrder: 15,
        includeInTotal: true,
        formula: {
          decimals: 2,
          expression: `{{${IDS.lineCostTax}}} * {{${IDS.lineCoeff}}}`,
        },
      }),
      baseField({
        id: IDS.lineComment,
        name: "Комментарий",
        type: "textarea",
        tableOrder: 16,
        colSpan: 4,
        showInTable: true,
      }),
    ],
    tabs: [overviewTab],
  });
}

function mergeDeptCalcHost(existingDef) {
  const def = ensureEntityShape({
    ...existingDef,
    id: DEPT_CALC,
    name: existingDef.name || "Расчёты отделов",
    namePlural: existingDef.namePlural || "Расчёты отделов",
    icon: existingDef.icon || "calculator",
  });
  const fields = Array.isArray(def.fields) ? [...def.fields] : [];

  upsertField(
    fields,
    baseField({
      id: IDS.dcDept,
      name: "Отдел",
      type: "relation",
      relationEntityId: DEPT,
      tableOrder: 6,
      showInFilters: true,
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcDeadline,
      name: "Срок выполнения работы, раб. дни",
      type: "number",
      unitSuffix: "раб. дн.",
      tableOrder: 10,
      decimals: 0,
      required: true,
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcDescription,
      name: "Описание работ",
      type: "textarea",
      tableOrder: 11,
      colSpan: 4,
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcComment,
      name: "Комментарий",
      type: "textarea",
      tableOrder: 12,
      colSpan: 4,
      showInTable: false,
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcStatus,
      name: "Статус",
      type: "list",
      tableOrder: 13,
      listOptions: deptCalcStatusOptions(),
      defaultValue: { kind: "literal", value: OPT.stWait },
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcRate,
      name: "Ставка отдела",
      type: "lookup",
      tableOrder: 14,
      unitSuffix: "₽",
      lookup: {
        relationFieldId: IDS.dcDept,
        targetFieldId: IDS.deptRate,
      },
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcHoursRollup,
      name: "Часы",
      type: "rollup",
      unitSuffix: "ч",
      tableOrder: 20,
      includeInTotal: true,
      rollup: {
        sourceEntityId: LINES,
        linkFieldId: IDS.lineParent,
        valueFieldId: IDS.lineHours,
        aggregation: "sum",
        conditions: [],
        decimals: 2,
      },
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcLaborRollup,
      name: "Стоимость трудозатрат",
      type: "rollup",
      unitSuffix: "₽",
      tableOrder: 21,
      includeInTotal: true,
      rollup: {
        sourceEntityId: LINES,
        linkFieldId: IDS.lineParent,
        valueFieldId: IDS.lineCost,
        aggregation: "sum",
        conditions: [],
        decimals: 2,
      },
    }),
  );
  upsertField(
    fields,
    baseField({
      id: IDS.dcTotalRollup,
      name: "Итог отдела",
      type: "rollup",
      unitSuffix: "₽",
      tableOrder: 22,
      includeInTotal: true,
      rollup: {
        sourceEntityId: LINES,
        linkFieldId: IDS.lineParent,
        valueFieldId: IDS.lineCostCoeff,
        aggregation: "sum",
        conditions: [],
        decimals: 2,
      },
    }),
  );

  def.fields = fields;
  def.tableNestedEntityId = LINES;

  const tabs = Array.isArray(def.tabs) ? [...def.tabs] : [overviewTab];
  if (!tabs.some((tab) => tab.id === IDS.dcLinesTab)) {
    tabs.push({
      id: IDS.dcLinesTab,
      kind: "entity",
      name: "Подзадачи отдела",
      locked: false,
      tableFlat: false,
      sourceTabId: null,
      singleRecord: false,
      defaultFolders: [],
      linkedEntityId: LINES,
      parentLinkFieldId: IDS.lineParent,
      sourceRelationFieldId: null,
    });
  } else {
    const tab = tabs.find((item) => item.id === IDS.dcLinesTab);
    tab.linkedEntityId = LINES;
    tab.parentLinkFieldId = IDS.lineParent;
    tab.name = "Подзадачи отдела";
  }
  def.tabs = tabs;
  return def;
}

function extractDeptFromGroups(raw) {
  try {
    const nodes = JSON.parse(raw || "[]");
    if (!Array.isArray(nodes)) return "";
    for (const stage of nodes) {
      const children = Array.isArray(stage?.children) ? stage.children : [];
      for (const child of children) {
        if (typeof child?.id === "string" && child.id.startsWith("record-")) {
          return child.id;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return "";
}

async function main() {
  const signup = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: `seed-worktpl-${Date.now()}@example.com`,
      password: `Seed-${crypto.randomUUID()}`,
    }),
  });
  const auth = await signup.json();
  const token = auth.access_token;
  if (!token) throw new Error(`auth failed: ${JSON.stringify(auth)}`);

  // 1) Отдел.Ставка
  const deptRows = await api(token, `entities?id=eq.${DEPT}&select=definition`);
  if (!deptRows?.[0]) throw new Error("Отдел entity missing");
  const deptDef = deptRows[0].definition;
  const deptFields = [...(deptDef.fields || [])];
  upsertField(
    deptFields,
    baseField({
      id: IDS.deptRate,
      name: "Ставка",
      type: "number",
      unitSuffix: "₽",
      tableOrder: 20,
      decimals: 2,
      defaultValue: { kind: "literal", value: "2500" },
    }),
  );
  deptDef.fields = deptFields;
  await api(token, `entities?id=eq.${DEPT}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ definition: deptDef }),
  });
  console.log("patched Отдел.Ставка");

  // default rate on existing departments if empty
  const depts = await api(
    token,
    `entity_records?entity_id=eq.${DEPT}&select=id,field_values`,
  );
  for (const row of depts || []) {
    const values = { ...(row.field_values || {}) };
    if (!String(values[IDS.deptRate] || "").trim()) {
      values[IDS.deptRate] = "2500";
      await api(token, `entity_records?id=eq.${row.id}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ field_values: values }),
      });
    }
  }

  // 2) Шаблоны работ
  await upsertEntity(token, WORK, buildWorkTemplatesDef());
  console.log("upserted Шаблоны работ");

  // sample templates for engineering-ish departments
  const sampleNames = [
    "Расчёт трудозатрат",
    "Подрядные работы",
    "Изыскания",
    "Экспертиза",
  ];
  const sampleCats = [
    OPT.catLabor,
    OPT.catContract,
    OPT.catSurvey,
    OPT.catExpertise,
  ];
  const sampleTypes = [OPT.calcHours, OPT.calcSum, OPT.calcSum, OPT.calcSum];
  let tplIndex = 0;
  for (const dept of depts || []) {
    const deptLabel = String(dept.field_values?.[DEPT_NAME] || "").trim();
    if (!deptLabel) continue;
    // skip pure admin departments for samples
    if (
      /бухгалтер|директор|кдп|безопасн|финанс|юридич|оптимиз|подрядчик|линк|коммерч/i.test(
        deptLabel,
      )
    ) {
      continue;
    }
    for (let i = 0; i < sampleNames.length; i += 1) {
      tplIndex += 1;
      const id = `record-worktpl-${dept.id.slice(-8)}-${i + 1}`;
      await upsertRecord(token, id, WORK, {
        [IDS.workName]: sampleNames[i],
        [IDS.workDept]: dept.id,
        [IDS.workCalcType]: sampleTypes[i],
        [IDS.workCategory]: sampleCats[i],
        [IDS.workTaxStatus]: sampleCats[i] === OPT.catContract ? OPT.taxIp : "",
        [IDS.workTax]: sampleCats[i] === OPT.catContract ? "6" : "0",
        [IDS.workCoeff]: "1.2",
        [IDS.workNeedFile]: "true",
        [IDS.workActive]: "true",
        [IDS.workHint]: "",
      });
    }
  }
  console.log("seeded sample work templates", tplIndex);

  // 3) Подзадачи отдела
  await upsertEntity(token, LINES, buildLinesDef());
  console.log("upserted Подзадачи отдела");

  // 4) Patch Расчёты отделов
  const dcRows = await api(
    token,
    `entities?id=eq.${DEPT_CALC}&select=definition`,
  );
  if (!dcRows?.[0]) throw new Error("Расчёты отделов missing");
  const nextDc = mergeDeptCalcHost(dcRows[0].definition);
  await upsertEntity(token, DEPT_CALC, nextDc);
  console.log("patched Расчёты отделов + nested tab");

  // backfill Отдел from relationGroups on existing calc rows
  const calcs = await api(
    token,
    `entity_records?entity_id=eq.${DEPT_CALC}&select=id,field_values`,
  );
  let backfilled = 0;
  for (const row of calcs || []) {
    const values = { ...(row.field_values || {}) };
    if (String(values[IDS.dcDept] || "").trim()) continue;
    const deptId = extractDeptFromGroups(values[IDS.dcGroups]);
    if (!deptId) continue;
    values[IDS.dcDept] = deptId;
    if (!String(values[IDS.dcStatus] || "").trim()) {
      values[IDS.dcStatus] = OPT.stWait;
    }
    await api(token, `entity_records?id=eq.${row.id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ field_values: values }),
    });
    backfilled += 1;
  }
  console.log("backfilled Отдел on calc rows", backfilled);

  // verify step 7 template still has fanOut
  const step7 = await api(
    token,
    `automation_task_templates?id=eq.atpl-tkp-dept-calc&select=id,name,assignee`,
  );
  const assignee = step7?.[0]?.assignee;
  const fanOutOk = Boolean(
    assignee?.fanOut && assignee?.completeWhen === "all",
  );
  console.log("step7 fanOut", fanOutOk ? "ok" : "MISSING", assignee || null);

  const result = {
    workTemplatesEntity: WORK,
    linesEntity: LINES,
    deptCalcEntity: DEPT_CALC,
    sampleTemplates: tplIndex,
    backfilledDept: backfilled,
    step7FanOut: fanOutOk,
  };
  writeFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "seed-work-templates-result.json",
    ),
    JSON.stringify(result, null, 2),
  );
  console.log("done", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
