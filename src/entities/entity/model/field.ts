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
  | "phone"
  | "email"
  | "url"
  | "list"
  | "relation"
  | "relationGroups"
  | "dependencies"
  | "file"
  | "formula"
  | "rollup"
  | "lookup";

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
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Эл. почта" },
  { value: "url", label: "Ссылка" },
  { value: "list", label: "Список" },
  { value: "relation", label: "Связь" },
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
      "phone",
      "email",
      "url",
      "file",
    ],
  },
  {
    label: "Списки и связи",
    types: ["list", "relation", "relationGroups", "dependencies"],
  },
  { label: "Вычисляемые", types: ["formula", "rollup", "lookup"] },
];

/**
 * Types that store structured JSON (not a scalar / simple id list).
 * Excluded from formulas, conditions, lookup targets, etc.
 */
export function isEntityStructuredFieldType(type: EntityFieldType) {
  return (
    type === "file" || type === "dependencies" || type === "relationGroups"
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
 * Lookup stays toggleable so it can be hidden from the new-record form.
 */
export function canEntityFieldToggleShowOnCreate(type: EntityFieldType) {
  if (type === "lookup") return true;
  return !isEntityComputedFieldType(type);
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

/**
 * One row of a `relationGroups` field: primary record + nested multi-select.
 * Stored as JSON on the parent record (e.g. lead stages → departments).
 */
export type EntityRelationGroupItem = {
  itemId: string;
  nestedIds: string[];
};

export function parseEntityRelationGroups(
  value: string | undefined,
): EntityRelationGroupItem[] {
  const raw = value?.trim() ?? "";
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: EntityRelationGroupItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const itemId =
        typeof record.itemId === "string" ? record.itemId.trim() : "";
      if (!itemId || seen.has(itemId)) continue;
      seen.add(itemId);
      const nestedRaw = record.nestedIds;
      const nestedIds = Array.isArray(nestedRaw)
        ? [
            ...new Set(
              nestedRaw
                .map((id) => (typeof id === "string" ? id.trim() : ""))
                .filter((id) => id.length > 0),
            ),
          ]
        : [];
      result.push({ itemId, nestedIds });
    }
    return result;
  } catch {
    return [];
  }
}

export function serializeEntityRelationGroups(
  groups: readonly EntityRelationGroupItem[],
): string {
  return groups.length > 0 ? JSON.stringify(groups) : "";
}

/** Ask / form presentation for a `relationGroups` field. */
export type EntityRelationGroupsMode = "full" | "items" | "nested";

/**
 * Whether a relationGroups value satisfies required validation for `mode`.
 * - items / full — at least one row
 * - nested — every row has at least one nested id
 */
export function isEntityRelationGroupsFilled(
  value: string | undefined,
  mode: EntityRelationGroupsMode = "full",
) {
  const groups = parseEntityRelationGroups(value);
  if (groups.length === 0) return false;
  if (mode === "nested") {
    return groups.every((group) => group.nestedIds.length > 0);
  }
  return true;
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

export function getEntityRelationTargetId(field: {
  type: EntityFieldType;
  relationEntityId?: string | null;
}) {
  if (field.type !== "relation") return null;
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

/**
 * Typed decimal with comma as separator.
 * Dots become commas; at most 2 digits after the comma.
 */
export function normalizeEntityDecimalInput(value: string): string {
  let next = value.replace(/\s/g, "").replace(/\./g, ",");
  next = next.replace(/[^\d,-]/g, "");

  const negative = next.startsWith("-");
  next = next.replace(/-/g, "");

  const commaIndex = next.indexOf(",");
  if (commaIndex === -1) {
    return negative ? `-${next}` : next;
  }

  const intPart = next.slice(0, commaIndex).replace(/,/g, "");
  const fracPart = next
    .slice(commaIndex + 1)
    .replace(/,/g, "")
    .slice(0, 2);
  next = `${intPart},${fracPart}`;
  return negative ? `-${next}` : next;
}

/** Number → stored decimal string (comma, up to 2 fraction digits). */
export function serializeEntityDecimal(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

/** Parse stored/typed decimal (comma or dot) to a finite-checkable number. */
export function parseEntityDecimal(value: string): number {
  const trimmed = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed || trimmed === "-" || trimmed === ".") return Number.NaN;
  return Number(trimmed);
}

/** Format a total/sum with the same glyphs as regular number cells. */
export function formatEntityDecimalTotal(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  const raw = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(".", ",");
  const formatted = formatEntityNumberDisplay(raw);
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
  },
  values: Record<string, string | undefined>,
): string {
  if (field.type !== "numberSum") return "—";
  const ids = normalizeEntitySumFieldIds(field.sumFieldIds);
  if (ids.length === 0) return "—";
  const hasAny = ids.some((id) => (values[id] ?? "").trim().length > 0);
  if (!hasAny) return "—";
  return formatEntityDecimalTotal(
    sumEntityDecimalValues(ids.map((id) => values[id])),
  );
}

/** Normalize a typed value before storing it (phone «+», decimal comma). */
export function normalizeEntityFieldInputValue(
  field: { type: EntityFieldType },
  value: string,
): string {
  if (field.type === "phone") return normalizeEntityPhoneValue(value);
  if (field.type === "number") return normalizeEntityDecimalInput(value);
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
export function formatEntityNumberDisplay(value: string): string {
  const trimmed = value.trim().replace(/\s/g, "");
  if (!trimmed) return "";
  const numeric = parseEntityDecimal(trimmed);
  if (!Number.isFinite(numeric)) return value.trim();

  const normalized = trimmed.replace(",", ".");
  const fractionDigits = Math.min(
    2,
    normalized.includes(".") ? (normalized.split(".")[1]?.length ?? 0) : 0,
  );

  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
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
    const formatted = formatEntityNumberDisplay(raw);
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
    datetimeWithTime?: boolean;
  },
  value: string | undefined,
) {
  if (field.type === "number") {
    const raw = value?.trim() ?? "";
    if (!raw) return "—";
    const formatted = formatEntityNumberDisplay(raw);
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
