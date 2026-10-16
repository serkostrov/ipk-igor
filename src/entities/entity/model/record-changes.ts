import {
  getEntityTabFilesValueKey,
  getEntityTabRecordsValueKey,
  parseEntityTabFileEntries,
  parseEntityTabRecordEntries,
  type Entity,
  type EntityField,
} from "./types";

/** Stored value before/after a change (raw `field_values` strings). */
export type EntityRecordValueChange = {
  old: string | null;
  new: string | null;
};

export type EntityRecordChangeItem =
  | {
      kind: "field";
      key: string;
      field: EntityField;
      before: string;
      after: string;
    }
  | {
      kind: "notes" | "files";
      key: string;
      tabName: string;
      added: number;
      removed: number;
    };

function countDiff(before: string[], after: string[]) {
  const beforeIds = new Set(before);
  const afterIds = new Set(after);
  return {
    added: after.filter((id) => !beforeIds.has(id)).length,
    removed: before.filter((id) => !afterIds.has(id)).length,
  };
}

/** Readable changes in field order; tab payloads become add/remove counts. */
export function describeEntityRecordChanges(
  entity: Pick<Entity, "fields" | "tabs">,
  changes: Record<string, EntityRecordValueChange>,
): EntityRecordChangeItem[] {
  const items: EntityRecordChangeItem[] = [];

  for (const field of entity.fields) {
    const change = changes[field.id];
    const before = change?.old ?? "";
    const after = change?.new ?? "";
    if (!change || before === after) continue;
    items.push({ kind: "field", key: field.id, field, before, after });
  }

  for (const tab of entity.tabs) {
    const notesKey = getEntityTabRecordsValueKey(tab.id);
    const notes = changes[notesKey];
    if (notes) {
      items.push({
        kind: "notes",
        key: notesKey,
        tabName: tab.name,
        ...countDiff(
          parseEntityTabRecordEntries(notes.old ?? "").map((entry) => entry.id),
          parseEntityTabRecordEntries(notes.new ?? "").map((entry) => entry.id),
        ),
      });
    }
    const filesKey = getEntityTabFilesValueKey(tab.id);
    const files = changes[filesKey];
    if (files) {
      items.push({
        kind: "files",
        key: filesKey,
        tabName: tab.name,
        ...countDiff(
          parseEntityTabFileEntries(files.old ?? "").map((entry) => entry.id),
          parseEntityTabFileEntries(files.new ?? "").map((entry) => entry.id),
        ),
      });
    }
  }

  return items;
}
