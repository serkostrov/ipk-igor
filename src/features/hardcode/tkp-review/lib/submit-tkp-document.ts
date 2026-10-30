/**
 * Generate a TKP commercial document from a price revision, upload into the
 * «ТКП» files folder (bound to the revision), and kick approval via list field
 * / soft keys so automation can run the decision chain.
 */

import {
  DEFAULT_ENTITY_FOLDER_COLOR,
  getEntityRecordTitle,
  getEntityTabFilesValueKey,
  getEntityValueContext,
  isEntityFilesTab,
  isEntityNameField,
  normalizeListColor,
  parseEntityTabFileEntries,
  serializeEntityTabFileEntries,
  updateEntityRecord,
  uploadEntityFile,
  type Entity,
  type EntityRecord,
  type EntityTabFileEntry,
} from "@/entities/entity";
import { buildTkpCommercialDocumentFile } from "../../tkp-commercial/model/document";
import type { TkpPriceRevisionSummary } from "../../tkp-commercial/model/types";
import { isTkpDocumentsFolder } from "./tkp-file-bind";
import {
  findTkpApprovalListField,
  resolveTkpApprovalPendingOptionId,
  writeTkpApprovalSubmittedPatch,
} from "./tkp-approval";

function uniqueFileName(
  base: string,
  existing: readonly string[],
): string {
  const names = new Set(existing.map((name) => name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let index = 2;
  while (names.has(`${stem} ${index}${ext}`.toLowerCase())) index += 1;
  return `${stem} ${index}${ext}`;
}

function ensureTkpDocumentsFolder(entries: EntityTabFileEntry[]): {
  entries: EntityTabFileEntry[];
  folderId: string;
} {
  const existing = entries.find(
    (entry) => entry.kind === "folder" && isTkpDocumentsFolder(entry),
  );
  if (existing) {
    return { entries, folderId: existing.id };
  }

  const folder: EntityTabFileEntry = {
    id: crypto.randomUUID(),
    name: "ТКП",
    kind: "folder",
    parentId: null,
    createdAt: new Date().toISOString(),
    color: normalizeListColor(DEFAULT_ENTITY_FOLDER_COLOR),
  };
  return { entries: [...entries, folder], folderId: folder.id };
}

export type SubmitTkpDocumentForApprovalResult = {
  fileName: string;
  revisionId: string;
  approvalFieldUpdated: boolean;
  approvalFieldName: string | null;
};

export async function submitTkpDocumentForApproval(input: {
  entity: Entity;
  record: EntityRecord;
  revision: TkpPriceRevisionSummary;
  entities: readonly Entity[];
}): Promise<SubmitTkpDocumentForApprovalResult> {
  if (!input.revision.calculation) {
    throw new Error("У ревизии цены нет расчёта — сначала сохраните цену");
  }

  const filesTab = input.entity.tabs.find((tab) => isEntityFilesTab(tab));
  if (!filesTab) {
    throw new Error(
      "Добавьте вкладку «Файлы» на сущность, чтобы сохранить документ ТКП",
    );
  }

  const ctx = getEntityValueContext(input.entities);
  const recordTitle = getEntityRecordTitle(
    ctx,
    input.entity,
    input.record,
    "",
  ).trim();
  const nameField = input.entity.fields.find((field) =>
    isEntityNameField(field),
  );
  const rawName = nameField
    ? (input.record.values[nameField.id] ?? "").trim()
    : "";
  const title =
    recordTitle && recordTitle !== "—"
      ? recordTitle
      : rawName || "Без названия";

  const file = buildTkpCommercialDocumentFile({
    recordTitle: title,
    revision: input.revision,
  });

  const valueKey = getEntityTabFilesValueKey(filesTab.id);
  let entries = parseEntityTabFileEntries(input.record.values[valueKey]);
  const ensured = ensureTkpDocumentsFolder(entries);
  entries = ensured.entries;
  const folderId = ensured.folderId;

  const siblingNames = entries
    .filter((entry) => entry.parentId === folderId && entry.kind === "file")
    .map((entry) => entry.name);
  const fileName = uniqueFileName(file.name, siblingNames);
  const entryId = crypto.randomUUID();

  const uploaded = await uploadEntityFile({
    entityId: input.entity.id,
    recordId: input.record.id,
    tabId: filesTab.id,
    entryId,
    file,
  });

  const fileEntry: EntityTabFileEntry = {
    id: entryId,
    name: fileName,
    kind: "file",
    parentId: folderId,
    createdAt: new Date().toISOString(),
    mimeType: file.type || "text/html",
    size: file.size,
    storagePath: uploaded.storagePath,
    dataUrl: uploaded.dataUrl,
    priceHistoryId: input.revision.id,
  };
  entries = [...entries, fileEntry];

  const approvalField = findTkpApprovalListField(input.entity);
  const pendingOptionId = approvalField
    ? resolveTkpApprovalPendingOptionId(approvalField, input.entities)
    : null;
  const approvalFieldUpdated = Boolean(approvalField && pendingOptionId);

  const nextValues = writeTkpApprovalSubmittedPatch({
    entity: input.entity,
    entities: input.entities,
    values: {
      ...input.record.values,
      [valueKey]: serializeEntityTabFileEntries(entries),
    },
    revisionId: input.revision.id,
  });

  await updateEntityRecord(input.entity.id, input.record.id, nextValues);

  return {
    fileName,
    revisionId: input.revision.id,
    approvalFieldUpdated,
    approvalFieldName: approvalField
      ? approvalField.name.trim() || null
      : null,
  };
}
