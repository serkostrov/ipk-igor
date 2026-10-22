import { getEntityFieldDisplayName, type EntityField } from "@/entities/entity";

export type TemplatePart =
  { kind: "text"; text: string } | { kind: "field"; id: string };

export function fieldTemplateToken(fieldId: string) {
  return `{{${fieldId}}}`;
}

/** Split `Hello {{fieldId}}_rest` into text / field parts. */
export function parseTemplateParts(value: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  for (const match of value.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ kind: "text", text: value.slice(lastIndex, index) });
    }
    const id = match[1]?.trim() ?? "";
    if (id) parts.push({ kind: "field", id });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) {
    parts.push({ kind: "text", text: value.slice(lastIndex) });
  }
  return parts;
}

export function serializeTemplateParts(parts: TemplatePart[]) {
  return parts
    .map((part) =>
      part.kind === "field" ? fieldTemplateToken(part.id) : part.text,
    )
    .join("");
}

export function resolveTemplateField(
  fields: readonly EntityField[],
  token: string,
): EntityField | null {
  const id = token.trim();
  if (!id) return null;
  return (
    fields.find((field) => field.id === id) ??
    fields.find((field) => field.systemKey === id) ??
    null
  );
}

export function getTemplateFieldLabel(
  fields: readonly EntityField[],
  token: string,
): string {
  const field = resolveTemplateField(fields, token);
  return field ? getEntityFieldDisplayName(field) : "поле";
}

/**
 * Human-readable template for selects / lists: `{{fieldId}}` → `[Имя поля]`.
 */
export function formatTemplateLabel(
  template: string,
  fields: readonly EntityField[],
  empty = "Без названия",
): string {
  const trimmed = template.trim();
  if (!trimmed) return empty;
  const label = parseTemplateParts(trimmed)
    .map((part) =>
      part.kind === "field"
        ? `[${getTemplateFieldLabel(fields, part.id)}]`
        : part.text,
    )
    .join("")
    .trim();
  return label || empty;
}

/** Replace `{{fieldId}}` with record values (preview / client render). */
export function renderTemplateText(
  template: string,
  values: Record<string, string | undefined>,
  fallback = "",
): string {
  const source = template.trim() || fallback;
  return source.replace(/\{\{([^}]+)\}\}/g, (_, rawId: string) => {
    const fieldId = rawId.trim();
    const value = values[fieldId];
    if (value == null || value.trim() === "") return "";
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .join(", ");
      }
    } catch {
      // plain string
    }
    return value;
  });
}
