import {
  formatRecordFieldValue,
  getEntityFieldDisplayName,
  getEntityValueContext,
  resolveRelationRecordLabel,
  type Entity,
} from "@/entities/entity";

const FIELD_TOKEN_RE = /\{\{([^}]+)\}\}/g;
const RECORD_ID_RE = /\b((?:record-|user-)[0-9a-fA-F-]{8,})\b/g;

/**
 * Replace `{{fieldId}}` placeholders with human-readable field values.
 * Relation / list / users resolve to names — never raw record ids.
 */
export function renderNotificationTemplate(
  template: string,
  values: Record<string, string | undefined>,
  fallback = "",
  options?: {
    entity?: Entity | null;
    entities?: readonly Entity[];
    /** When true, unresolved tokens become `[Field name]` for rule preview. */
    previewUnresolved?: boolean;
  },
): string {
  const source = template.trim() || fallback;
  if (!source) return "";

  const entity = options?.entity ?? null;
  const entities =
    options?.entities ?? (entity ? ([entity] as readonly Entity[]) : []);
  const ctx = entities.length > 0 ? getEntityValueContext(entities) : null;
  const fakeRecord =
    entity != null
      ? {
          id: "__notification-preview__",
          values: Object.fromEntries(
            Object.entries(values).map(([key, value]) => [key, value ?? ""]),
          ),
          authUserId: null as string | null,
          createdBy: null as string | null,
          schemaVersion: 1,
        }
      : null;

  let result = source.replace(FIELD_TOKEN_RE, (_, rawId: string) => {
    const fieldId = rawId.trim();
    if (!fieldId) return "";
    const value = values[fieldId];
    if (value == null || String(value).trim() === "") return "";

    if (entity && ctx && fakeRecord) {
      const field = entity.fields.find((item) => item.id === fieldId);
      if (field) {
        const formatted = formatRecordFieldValue(
          ctx,
          entity,
          fakeRecord,
          field,
        ).trim();
        if (formatted && formatted !== "—") return formatted;
      }
    }

    return formatRawFieldValue(String(value), entities);
  });

  result = result.replace(FIELD_TOKEN_RE, (_, rawId: string) => {
    if (!options?.previewUnresolved || !entity) return "";
    const field = entity.fields.find((item) => item.id === rawId.trim());
    return field ? `[${getEntityFieldDisplayName(field)}]` : "";
  });

  result = replaceBareRecordIds(result, entities);
  return tidyNotificationText(result);
}

/** Resolve stored title/message that still contain `{{field-…}}` or bare ids. */
export function resolveStoredNotificationText(
  text: string,
  options?: {
    entityId?: string | null;
    recordId?: string | null;
    entities?: readonly Entity[];
  },
): string {
  const entities = options?.entities ?? [];
  const source = text.trim();
  if (!source) return "";

  if (
    entities.length > 0 &&
    /\{\{[^}]+\}\}/.test(source) &&
    options?.entityId &&
    options?.recordId
  ) {
    const entity = entities.find((item) => item.id === options.entityId);
    const record = entity?.records.find((item) => item.id === options.recordId);
    if (entity && record) {
      return renderNotificationTemplate(source, record.values, "", {
        entity,
        entities,
      });
    }
  }

  let result = source.replace(FIELD_TOKEN_RE, "");
  result = replaceBareRecordIds(result, entities);
  return tidyNotificationText(result);
}

/** Replace bare `record-…` / `user-…` tokens with catalog names. */
export function replaceBareRecordIds(
  text: string,
  entities: readonly Entity[],
): string {
  if (!text || entities.length === 0) return text;
  return text.replace(
    RECORD_ID_RE,
    (full, id: string, offset: number, source: string) => {
      const label = resolveIdLabel(id, entities);
      if (!label) return full;
      const after = source.slice(offset + full.length);
      // «record-… Same Name…» → drop the id, keep the existing name.
      if (
        after.startsWith(label) ||
        after.toLocaleLowerCase("ru").startsWith(label.toLocaleLowerCase("ru"))
      ) {
        return "";
      }
      return label;
    },
  );
}

function formatRawFieldValue(
  value: string,
  entities: readonly Entity[],
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((id) => resolveIdLabel(id, entities) ?? id)
        .join(", ");
    }
  } catch {
    // plain string
  }

  return resolveIdLabel(trimmed, entities) ?? trimmed;
}

function resolveIdLabel(
  id: string,
  entities: readonly Entity[],
): string | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  for (const entity of entities) {
    if (!entity.records.some((record) => record.id === trimmed)) continue;
    const label = resolveRelationRecordLabel(entity, trimmed, entities)?.trim();
    if (label && label !== "Без названия") return label;
  }
  return null;
}

function tidyNotificationText(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;:.!?])/g, "$1")
    .trim();
}
