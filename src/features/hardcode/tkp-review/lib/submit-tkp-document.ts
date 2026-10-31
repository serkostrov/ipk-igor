/**
 * Generate a TKP commercial document from a price revision, upload into the
 * «ТКП» files folder (bound to the revision), and kick approval via list field
 * / soft keys so automation can run the decision chain.
 */

import {
  getEntityRecordTitle,
  getEntityTabFilesValueKey,
  getEntityValueContext,
  isEntityNameField,
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
import {
  findTkpApprovalListField,
  resolveTkpApprovalPendingOptionId,
  writeTkpApprovalSubmittedPatch,
} from "./tkp-approval";
import { resolveTkpDocumentFilesTarget } from "./resolve-tkp-files-target";
import { ensureTkpDocumentsFolder, uniqueTkpFileName } from "./revision-files";

export type SubmitTkpDocumentForApprovalResult = {
  fileName: string;
  revisionId: string;
  approvalFieldUpdated: boolean;
  approvalFieldName: string | null;
  filesTabName: string;
  createdFilesTab: boolean;
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

  const target = resolveTkpDocumentFilesTarget({
    entity: input.entity,
    record: input.record,
    entities: input.entities,
  });

  const ctx = getEntityValueContext(input.entities);
  const recordTitle = getEntityRecordTitle(
    ctx,
    target.entity,
    target.record,
    "",
  ).trim();
  const nameField = target.entity.fields.find((field) =>
    isEntityNameField(field),
  );
  const rawName = nameField
    ? (target.record.values[nameField.id] ?? "").trim()
    : "";
  const title =
    recordTitle && recordTitle !== "—"
      ? recordTitle
      : rawName || "Без названия";

  const file = buildTkpCommercialDocumentFile({
    recordTitle: title,
    revision: input.revision,
  });

  const valueKey = getEntityTabFilesValueKey(target.tab.id);
  let entries = parseEntityTabFileEntries(target.record.values[valueKey]);
  const ensured = ensureTkpDocumentsFolder(entries);
  entries = ensured.entries;
  const folderId = ensured.folderId;

  const siblingNames = entries
    .filter((entry) => entry.parentId === folderId && entry.kind === "file")
    .map((entry) => entry.name);
  const fileName = uniqueTkpFileName(file.name, siblingNames);
  const entryId = crypto.randomUUID();

  const uploaded = await uploadEntityFile({
    entityId: target.entity.id,
    recordId: target.record.id,
    tabId: target.tab.id,
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

  const approvalField = findTkpApprovalListField(target.entity);
  const pendingOptionId = approvalField
    ? resolveTkpApprovalPendingOptionId(approvalField, input.entities)
    : null;
  const approvalFieldUpdated = Boolean(approvalField && pendingOptionId);

  const nextValues = writeTkpApprovalSubmittedPatch({
    entity: target.entity,
    entities: input.entities,
    values: {
      ...target.record.values,
      [valueKey]: serializeEntityTabFileEntries(entries),
    },
    revisionId: input.revision.id,
  });

  await updateEntityRecord(target.entity.id, target.record.id, nextValues);

  return {
    fileName,
    revisionId: input.revision.id,
    approvalFieldUpdated,
    approvalFieldName: approvalField ? approvalField.name.trim() || null : null,
    filesTabName: target.tab.name.trim() || "Файлы",
    createdFilesTab: target.createdTab,
  };
}
