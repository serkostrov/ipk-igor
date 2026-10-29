import {
  formatDateDisplay,
  formatDatetimeOrDash,
  splitDatetime,
} from "@/shared/lib/format-date";

export type EntityFieldType =
  | "text"
  | "textarea"
  | "number"
  | "numberSum"
  | "boolean"
  | "datetime"
  | "time"
  | "period"
  | "phone"
  | "email"
  | "url"
  | "list"
  | "relation"
  /** Parent record of the same entity (single self-relation). */
  | "belonging"
  | "relationGroups"
  | "dependencies"
  | "file"
  | "formula"
  | "rollup"
  | "lookup";

/**
 * Fraction digits for number / numberSum / formula / rollup.
 * Integer in `0…ENTITY_NUMBER_DECIMALS_MAX` (default 2).
 */
export type EntityNumberDecimals = number;

/** Max digits after the decimal comma a field may request. */
export const ENTITY_NUMBER_DECIMALS_MAX = 10;

export const ENTITY_FIELD_TYPE_OPTIONS: Array<{
  value: EntityFieldType;
  label: string;
}> = [
  { value: "text", label: "Текст" },
  { value: "textarea", label: "Многострочный текст" },
  { value: "number", label: "Число" },
  { value: "boolean", label: "Да/Нет" },
  { value: "datetime", label: "Дата" },
  { value: "time", label: "Время" },
  { value: "period", label: "Период" },
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Эл. почта" },
  { value: "url", label: "Ссылка" },
  { value: "list", label: "Список" },
  { value: "relation", label: "Связь" },
  { value: "belonging", label: "Принадлежность" },
  { value: "relationGroups", label: "Наборы связей" },
  { value: "file", label: "Файлы" },
  { value: "dependencies", label: "Предшественники" },
  { value: "formula", label: "Формула" },
  { value: "rollup", label: "Сводка по связанным" },
  { value: "lookup", label: "Значение из связи" },
];

/** Type picker sections in field settings. */
export const ENTITY_FIELD_TYPE_GROUPS: Array<{
  label: string;
  types: EntityFieldType[];
}> = [
  {
    label: "Основные",
    types: [
      "text",
      "textarea",
      "number",
      "boolean",
      "datetime",
      "time",
      "period",
      "phone",
      "email",
      "url",
      "file",
    ],
  },
  {
    label: "Списки и связи",
    types: ["list", "relation", "belonging", "relationGroups", "dependencies"],
  },
  { label: "Вычисляемые", types: ["formula", "rollup", "lookup"] },
];

/** Relation and belonging — both store related record id(s). */
export function isEntityRelationLikeFieldType(type: EntityFieldType) {
  return type === "relation" || type === "belonging";
}

/**
 * Types that store structured JSON (not a scalar / simple id list).
 * Excluded from formulas, conditions, lookup targets, etc.
 */
export function isEntityStructuredFieldType(type: EntityFieldType) {
  return (
    type === "file" ||
    type === "dependencies" ||
    type === "relationGroups" ||
    type === "period"
  );
}

/** Read-only types whose value is derived from other data. */
export function isEntityComputedFieldType(type: EntityFieldType) {
  return (
    type === "numberSum" ||
    type === "formula" ||
    type === "rollup" ||
    type === "lookup"
  );
}

/**
 * Whether the field may use the «При создании» visibility toggle.
 * Formula / rollup / numberSum are never shown on create (see
 * `isEntityFieldVisibleOnCreate`) — no toggle. Lookup stays toggleable.
 */
export function canEntityFieldToggleShowOnCreate(type: EntityFieldType) {
  if (type === "formula" || type === "rollup" || type === "numberSum") {
    return false;
  }
  return true;
}

/** Types that may carry a unit suffix («ч», «₽», «%»). */
export function isEntityUnitFieldType(type: EntityFieldType) {
  return type === "number" || type === "formula" || type === "rollup";
}

/** Types with numeric values: number filters, column totals, numeric widths. */
export function isEntityNumericFieldType(type: EntityFieldType) {
  return type === "numberSum" || isEntityUnitFieldType(type);
}

/** Dependency kinds between records on a timeline. */
export const ENTITY_DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"] as const;
export type EntityDependencyType = (typeof ENTITY_DEPENDENCY_TYPES)[number];

export const ENTITY_DEPENDENCY_TYPE_LABELS: Record<
  EntityDependencyType,
  { label: string; short: string }
> = {
  FS: { label: "Окончание → начало", short: "ОН" },
  SS: { label: "Начало → начало", short: "НН" },
  FF: { label: "Окончание → окончание", short: "ОО" },
  SF: { label: "Начало → окончание", short: "НО" },
};

/** A predecessor link stored in a `dependencies` field value (JSON). */
export type EntityDependency = {
  recordId: string;
  type: EntityDependencyType;
  /** Lag in business days (may be negative). */
  lag: number;
};

export function parseEntityDependencies(
  value: string | undefined,
): EntityDependency[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: EntityDependency[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const recordId =
        typeof record.recordId === "string" ? record.recordId.trim() : "";
      if (!recordId || seen.has(recordId)) continue;
      seen.add(recordId);
      const type = ENTITY_DEPENDENCY_TYPES.includes(
        record.type as EntityDependencyType,
      )
        ? (record.type as EntityDependencyType)
        : "FS";
      const lag =
        typeof record.lag === "number" && Number.isFinite(record.lag)
          ? Math.round(record.lag)
          : 0;
      result.push({ recordId, type, lag });
    }
    return result;
  } catch {
    return [];
  }
}

export function serializeEntityDependencies(
  dependencies: readonly EntityDependency[],
): string {
  return dependencies.length > 0 ? JSON.stringify(dependencies) : "";
}

export function formatEntityDependencyLag(lag: number) {
  if (!lag) return "";
  return `${lag > 0 ? "+" : "−"}${Math.abs(lag)} р.д.`;
}

export {
  buildEntityRelationGroupsValue,
  buildEntityRelationGroupsValueLegacy,
  collectRelationGroupsIdsAtDepth,
  collectRelationGroupsLeafIds,
  createEntityRelationGroupsLevel,
  createRelationGroupsLevelId,
  emptyEntityRelationGroupsConfig,
  getRelationGroupsLeafEntityId,
  getRelationGroupsLevelEntityId,
  isEntityRelationGroupsConfigReady,
  isEntityRelationGroupsFilled,
  mapRelationGroupsNodes,
  normalizeEntityRelationGroupsConfig,
  parseEntityRelationGroups,
  pruneEntityRelationGroupsNodes,
  pruneEntityRelationGroupsValue,
  resolveRelationGroupsModeDepth,
  serializeEntityRelationGroups,
  updateRelationGroupsNodeChildren,
  withEntityRelationGroupsDefaultNested,
  withEntityRelationGroupsDefaults,
  type EntityRelationGroupItem,
  type EntityRelationGroupNode,
  type EntityRelationGroupsMode,
} from "./relation-groups";

/** Inclusive date range stored as JSON on a `period` field. */
export type EntityPeriodValue = {
  start: string;
  end: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string) {
  if (!ISO_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function parseEntityPeriod(
  value: string | undefined,
): EntityPeriodValue | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const start = typeof record.start === "string" ? record.start.trim() : "";
    const end = typeof record.end === "string" ? record.end.trim() : "";
    if (!isIsoDate(start) || !isIsoDate(end)) return null;
    return start <= end ? { start, end } : { start: end, end: start };
  } catch {
    return null;
  }
}

export function serializeEntityPeriod(
  period: EntityPeriodValue | null | undefined,
): string {
  if (!period) return "";
  const start = period.start.trim();
  const end = period.end.trim();
  if (!isIsoDate(start) || !isIsoDate(end)) return "";
  const normalized = start <= end ? { start, end } : { start: end, end: start };
  return JSON.stringify(normalized);
}

export function isEntityPeriodFilled(value: string | undefined) {
  return parseEntityPeriod(value) != null;
}

/** `DD.MM.YYYY — DD.MM.YYYY` (same day → single date). */
export function formatEntityPeriodDisplay(value: string | undefined) {
  const period = parseEntityPeriod(value);
  if (!period) return "—";
  const startLabel = formatDateDisplay(period.start);
  const endLabel = formatDateDisplay(period.end);
  if (!startLabel || !endLabel) return "—";
  return period.start === period.end
    ? startLabel
    : `${startLabel} — ${endLabel}`;
}

/** Stored type kept for computed number fields; not shown in the type picker. */
const ENTITY_FIELD_TYPE_LABELS: Partial<Record<EntityFieldType, string>> = {
  numberSum: "Сумма чисел",
};

const ENTITY_FIELD_TYPES = new Set<EntityFieldType>([
  ...ENTITY_FIELD_TYPE_OPTIONS.map((option) => option.value),
  "numberSum",
]);

export function isEntityFieldType(value: unknown): value is EntityFieldType {
  return (
    typeof value === "string" &&
    ENTITY_FIELD_TYPES.has(value as EntityFieldType)
  );
}

export function getEntityFieldTypeLabel(type: EntityFieldType) {
  return (
    ENTITY_FIELD_TYPE_OPTIONS.find((option) => option.value === type)?.label ??
    ENTITY_FIELD_TYPE_LABELS[type] ??
    type
  );
}

/** `{ value, label }` choices of fields for settings selects. */
export function getEntityFieldOptions(
  fields: ReadonlyArray<{
    id: string;
    name: string;
    type: EntityFieldType;
    group?: string;
  }>,
) {
  return fields.map((field) => ({
    value: field.id,
    label: getEntityFieldDisplayName(field),
  }));
}

/** Visible field caption: custom name, else group name, else type label. */
export function getEntityFieldDisplayName(field: {
  name: string;
  type: EntityFieldType;
  group?: string;
}) {
  const name = field.name.trim();
  if (name.length > 0) return name;
  const group = field.group?.trim() ?? "";
  if (group.length > 0) return group;
  return getEntityFieldTypeLabel(field.type);
}

/**
 * Resolve a field id to a UI caption. Never returns a raw id
 * (deleted / unknown → `missingLabel`).
 */
export function resolveEntityFieldLabel(
  fields: ReadonlyArray<{
    id: string;
    name: string;
    type: EntityFieldType;
    group?: string;
  }>,
  fieldId: string,
  missingLabel = "Удалённое поле",
): string {
  const id = fieldId.trim();
  if (!id) return "поле";
  const field = fields.find((item) => item.id === id);
  return field ? getEntityFieldDisplayName(field) : missingLabel;
}

export function getEntityRelationTargetId(field: {
  type: EntityFieldType;
  relationEntityId?: string | null;
}) {
  if (!isEntityRelationLikeFieldType(field.type)) return null;
  const id =
    typeof field.relationEntityId === "string"
      ? field.relationEntityId.trim()
      : "";
  return id.length > 0 ? id : null;
}

/** Parse relation field value: one id or comma-separated ids. */
export function parseEntityRelationIds(value: string | undefined): string[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return [
          ...new Set(
            parsed
              .map((item) => String(item ?? "").trim())
              .filter((item) => item.length > 0),
          ),
        ];
      }
    } catch {
      // fall through to CSV
    }
  }

  return [
    ...new Set(
      raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ];
}

export function serializeEntityRelationIds(ids: readonly string[]): string {
  return [
    ...new Set(
      ids.map((item) => item.trim()).filter((item) => item.length > 0),
    ),
  ].join(",");
}

/** List field values reuse the same id-list encoding as relations. */
export function parseEntityListValueIds(value: string | undefined): string[] {
  return parseEntityRelationIds(value);
}

export function serializeEntityListValueIds(ids: readonly string[]): string {
  return serializeEntityRelationIds(ids);
}

/** Virtual option id for the free-text «Другое» choice on list fields. */
export const ENTITY_LIST_OTHER_OPTION_ID = "__other__";
const ENTITY_LIST_OTHER_PREFIX = "__other__:";

export function isEntityListOtherValue(value: string | undefined): boolean {
  const raw = (value ?? "").trim();
  return (
    raw === ENTITY_LIST_OTHER_OPTION_ID ||
    raw.startsWith(ENTITY_LIST_OTHER_PREFIX)
  );
}

export function parseEntityListOtherText(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (raw.startsWith(ENTITY_LIST_OTHER_PREFIX)) {
    return raw.slice(ENTITY_LIST_OTHER_PREFIX.length);
  }
  return "";
}

export function serializeEntityListOtherValue(text: string): string {
  return `${ENTITY_LIST_OTHER_PREFIX}${text}`;
}

export function entityListValueIncludesId(
  value: string | undefined,
  id: string,
): boolean {
  return entityRelationIncludesId(value, id);
}

/** Attached file metadata stored in a `file` field value (JSON string). */
export type EntityFieldFileValue = {
  name: string;
  storagePath?: string;
  dataUrl?: string;
  mimeType?: string;
  size?: number;
};

function parseLegacyFieldFileObject(
  record: Record<string, unknown>,
): EntityFieldFileValue | null {
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return null;

  const file: EntityFieldFileValue = { name };
  if (typeof record.storagePath === "string" && record.storagePath.trim()) {
    file.storagePath = record.storagePath.trim();
  }
  if (typeof record.dataUrl === "string" && record.dataUrl.trim()) {
    file.dataUrl = record.dataUrl.trim();
  }
  if (typeof record.mimeType === "string" && record.mimeType.trim()) {
    file.mimeType = record.mimeType.trim();
  }
  if (typeof record.size === "number" && Number.isFinite(record.size)) {
    file.size = Math.max(0, Math.round(record.size));
  }
  if (!file.storagePath && !file.dataUrl) return null;
  return file;
}

/**
 * First attached file (legacy singular object or first file in a multi-file array).
 * Prefer `parseEntityFieldFileEntries` when listing all files.
 */
export function parseEntityFieldFileValue(
  value: string | undefined,
): EntityFieldFileValue | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        if (record.kind === "folder") continue;
        if (record.kind === "file" || record.kind == null) {
          const file = parseLegacyFieldFileObject(record);
          if (file) return file;
        }
      }
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    return parseLegacyFieldFileObject(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function serializeEntityFieldFileValue(
  file: EntityFieldFileValue | null,
) {
  if (!file) return "";
  return JSON.stringify(file);
}

/** Compact label for table/read views: name or «N файлов». */
export function formatEntityFieldFilesSummary(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const files = parsed.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        if (record.kind === "folder") return false;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        return Boolean(name);
      });
      if (files.length === 0) return "—";
      if (files.length === 1) {
        const name = (files[0] as { name: string }).name.trim();
        return name || "—";
      }
      const n = files.length;
      const mod10 = n % 10;
      const mod100 = n % 100;
      const word =
        mod10 === 1 && mod100 !== 11
          ? "файл"
          : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
            ? "файла"
            : "файлов";
      return `${n} ${word}`;
    }
    if (parsed && typeof parsed === "object") {
      return (
        parseLegacyFieldFileObject(parsed as Record<string, unknown>)?.name ??
        "—"
      );
    }
  } catch {
    /* ignore */
  }
  return "—";
}

export function entityRelationIncludesId(
  value: string | undefined,
  id: string,
): boolean {
  const target = id.trim();
  if (!target) return false;
  return parseEntityRelationIds(value).includes(target);
}

export function entityFieldInputType(type: EntityFieldType) {
  // number/price use text + inputMode=decimal so comma separator works.
  if (type === "phone") return "tel";
  if (type === "email") return "email";
  if (type === "url") return "url";
  return "text";
}

/** Clamp unknown → 0…max (default 2). */
export function normalizeEntityNumberDecimals(
  value: unknown,
): EntityNumberDecimals {
  if (typeof value !== "number" || !Number.isFinite(value)) return 2;
  return Math.min(ENTITY_NUMBER_DECIMALS_MAX, Math.max(0, Math.floor(value)));
}

/** Placeholder like `0`, `0,0`, `0,00` … for number inputs. */
export function entityNumberInputPlaceholder(
  decimals: EntityNumberDecimals = 2,
): string {
  const digits = normalizeEntityNumberDecimals(decimals);
  if (digits === 0) return "0";
  return `0,${"0".repeat(digits)}`;
}

/** Display / input fraction digits for a numeric field. */
export function getEntityFieldFractionDigits(field: {
  type: EntityFieldType;
  decimals?: EntityNumberDecimals;
  formula?: { decimals?: EntityNumberDecimals } | null;
  rollup?: { decimals?: EntityNumberDecimals } | null;
}): EntityNumberDecimals {
  if (field.type === "formula") {
    return normalizeEntityNumberDecimals(field.formula?.decimals);
  }
  if (field.type === "rollup") {
    return normalizeEntityNumberDecimals(field.rollup?.decimals);
  }
  if (field.type === "number" || field.type === "numberSum") {
    return normalizeEntityNumberDecimals(field.decimals);
  }
  return 2;
}

/**
 * Typed decimal with comma as separator.
 * Dots become commas; fraction length follows `decimals`.
 */
export function normalizeEntityDecimalInput(
  value: string,
  decimals: EntityNumberDecimals = 2,
): string {
  let next = value.replace(/\s/g, "").replace(/\./g, ",");
  next = next.replace(/[^\d,-]/g, "");

  const negative = next.startsWith("-");
  next = next.replace(/-/g, "");

  const commaIndex = next.indexOf(",");
  if (commaIndex === -1 || decimals === 0) {
    const intOnly = next.replace(/,/g, "");
    return negative ? `-${intOnly}` : intOnly;
  }

  const intPart = next.slice(0, commaIndex).replace(/,/g, "");
  const fracPart = next
    .slice(commaIndex + 1)
    .replace(/,/g, "")
    .slice(0, decimals);
  next = `${intPart},${fracPart}`;
  return negative ? `-${next}` : next;
}

/** Number → stored decimal string (comma, up to `decimals` fraction digits). */
export function serializeEntityDecimal(
  value: number,
  decimals: EntityNumberDecimals = 2,
): string {
  if (!Number.isFinite(value)) return "";
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  if (decimals === 0 || Number.isInteger(rounded)) {
    return String(Math.trunc(rounded));
  }
  return rounded.toFixed(decimals).replace(".", ",");
}

/** Parse stored/typed decimal (comma or dot) to a finite-checkable number. */
export function parseEntityDecimal(value: string): number {
  const trimmed = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === ".") return Number.NaN;
  return Number(trimmed);
}

/** Format a total/sum with the same glyphs as regular number cells. */
export function formatEntityDecimalTotal(
  value: number,
  decimals: EntityNumberDecimals = 2,
): string {
  if (!Number.isFinite(value)) return "—";
  const raw = serializeEntityDecimal(value, decimals);
  const formatted = formatEntityNumberDisplay(raw, decimals);
  return formatted.length > 0 ? formatted : "—";
}

/** Sum numeric field values across records (skips empty/invalid). */
export function sumEntityDecimalValues(
  values: Array<string | undefined>,
): number {
  let sum = 0;
  for (const value of values) {
    const numeric = parseEntityDecimal(value ?? "");
    if (Number.isFinite(numeric)) sum += numeric;
  }
  return sum;
}

export function isEntitySummableFieldType(
  type: EntityFieldType,
): type is "number" {
  return type === "number";
}

/** Number fields that can feed a «Сумма чисел» field. */
export function getEntitySummableFields<
  T extends { id: string; type: EntityFieldType },
>(fields: readonly T[], excludeFieldId?: string): T[] {
  return fields.filter(
    (field) =>
      isEntitySummableFieldType(field.type) &&
      (excludeFieldId == null || field.id !== excludeFieldId),
  );
}

export function normalizeEntitySumFieldIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  ];
}

/** Unit text for `number` fields (e.g. «м/с», «м/с»). Empty → null. */
export function normalizeEntityUnitSuffix(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Resolve sum field ids against current entity fields (drops stale ids). */
export function resolveEntitySumFieldIds(
  ids: readonly string[] | undefined,
  fields: ReadonlyArray<{ id: string; type: EntityFieldType }>,
  excludeFieldId?: string,
): string[] {
  const allowed = new Set(
    getEntitySummableFields(fields, excludeFieldId).map((field) => field.id),
  );
  return normalizeEntitySumFieldIds(ids).filter((id) => allowed.has(id));
}

/** Numeric value of a field for filters/totals (computes numberSum from sources). */
export function getEntityFieldNumericValue(
  field: {
    id: string;
    type: EntityFieldType;
    sumFieldIds?: readonly string[];
  },
  values: Record<string, string | undefined>,
): number {
  if (field.type === "numberSum") {
    const ids = normalizeEntitySumFieldIds(field.sumFieldIds);
    return sumEntityDecimalValues(ids.map((id) => values[id]));
  }
  if (field.type === "number") {
    return parseEntityDecimal(values[field.id] ?? "");
  }
  return Number.NaN;
}

/** Display value for a computed «Сумма чисел» field. */
export function formatEntityNumberSumDisplay(
  field: {
    type: EntityFieldType;
    sumFieldIds?: readonly string[];
    decimals?: EntityNumberDecimals;
  },
  values: Record<string, string | undefined>,
): string {
  if (field.type !== "numberSum") return "—";
  const ids = normalizeEntitySumFieldIds(field.sumFieldIds);
  if (ids.length === 0) return "—";
  const hasAny = ids.some((id) => (values[id] ?? "").trim().length > 0);
  if (!hasAny) return "—";
  const decimals = normalizeEntityNumberDecimals(field.decimals);
  return formatEntityDecimalTotal(
    sumEntityDecimalValues(ids.map((id) => values[id])),
    decimals,
  );
}

/** Normalize a typed value before storing it (phone «+», decimal comma). */
export function normalizeEntityFieldInputValue(
  field: { type: EntityFieldType; decimals?: EntityNumberDecimals },
  value: string,
): string {
  if (field.type === "phone") return normalizeEntityPhoneValue(value);
  if (field.type === "number") {
    return normalizeEntityDecimalInput(
      value,
      normalizeEntityNumberDecimals(field.decimals),
    );
  }
  return value;
}

/** Keep a single leading «+»; empty stays empty. */
export function normalizeEntityPhoneValue(value: string): string {
  const body = value.replace(/\+/g, "");
  if (!body.trim()) return "";
  return `+${body}`;
}

export function isValidEntityEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function getEntityContactHref(
  type: "phone" | "email",
  value: string | undefined,
): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  if (type === "phone") {
    const phone = normalizeEntityPhoneValue(raw);
    if (!phone) return null;
    return `tel:${phone.replace(/[^\d+]/g, "")}`;
  }
  if (!isValidEntityEmail(raw)) return null;
  return `mailto:${raw}`;
}

/** Prepend https:// when the value has no http(s) scheme. */
export function normalizeEntityUrlHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getEntityUrlHref(value: string | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  return normalizeEntityUrlHref(raw);
}

/** Group thousands with spaces; decimal separator is comma (ru-RU). */
export function formatEntityNumberDisplay(
  value: string,
  decimals: EntityNumberDecimals = 2,
): string {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return "";
  const numeric = parseEntityDecimal(trimmed);
  if (!Number.isFinite(numeric)) return value.trim();

  const normalized = trimmed.replace(",", ".");
  const fractionDigits = Math.min(
    decimals,
    normalized.includes(".") ? (normalized.split(".")[1]?.length ?? 0) : 0,
  );

  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: fractionDigits,
  }).format(numeric);
}

/** Display for types that do not need a lookup (list option or related record). */
export function formatEntityScalarFieldValue(
  type: EntityFieldType,
  value: string | undefined,
) {
  const raw = value?.trim() ?? "";
  if (type === "boolean") {
    if (raw === "true") return "Да";
    if (raw === "false") return "Нет";
    return "—";
  }
  if (type === "datetime") return formatDatetimeOrDash(raw);
  if (type === "period") return formatEntityPeriodDisplay(raw);
  if (type === "time") {
    const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!match) return raw.length > 0 ? raw : "—";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return raw.length > 0 ? raw : "—";
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  if (type === "phone") {
    const phone = normalizeEntityPhoneValue(raw);
    return phone.length > 0 ? phone : "—";
  }
  if (type === "number" || type === "numberSum") {
    if (!raw) return "—";
    const formatted = formatEntityNumberDisplay(raw, 2);
    return formatted.length > 0 ? formatted : "—";
  }
  if (type === "file") {
    return formatEntityFieldFilesSummary(raw);
  }
  return raw.length > 0 ? raw : "—";
}

/** Whether a datetime field stores and shows time (legacy default: yes). */
export function isEntityDatetimeWithTime(field: {
  type: EntityFieldType;
  datetimeWithTime?: boolean;
}) {
  return field.type === "datetime" && field.datetimeWithTime !== false;
}

/** Scalar display that can attach a per-field unit suffix. */
export function formatEntityFieldScalarValue(
  field: {
    type: EntityFieldType;
    unitSuffix?: string | null;
    decimals?: EntityNumberDecimals;
    datetimeWithTime?: boolean;
  },
  value: string | undefined,
) {
  if (field.type === "number") {
    const raw = value?.trim() ?? "";
    if (!raw) return "—";
    const formatted = formatEntityNumberDisplay(
      raw,
      normalizeEntityNumberDecimals(field.decimals),
    );
    if (!formatted) return "—";
    const unit = field.unitSuffix?.trim() ?? "";
    return unit.length > 0 ? `${formatted} ${unit}` : formatted;
  }
  if (field.type === "datetime" && !isEntityDatetimeWithTime(field)) {
    const raw = value?.trim() ?? "";
    if (!raw) return "—";
    const { date } = splitDatetime(raw);
    const formatted = formatDateDisplay(date);
    return formatted.length > 0 ? formatted : "—";
  }
  return formatEntityScalarFieldValue(field.type, value);
}
