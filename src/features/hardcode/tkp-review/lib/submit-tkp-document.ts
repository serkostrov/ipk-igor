/**
 * Generate a TKP commercial document from a price revision, upload into the
 * «ТКП» files folder (bound to the revision), and kick approval via list field
 * / soft keys so automation can run the decision chain.
 */

import {
  getEntityRecordById,
  getEntityConfig,
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
import { assertTkpDocumentApprovalReady } from "./assert-tkp-approval-ready";
import {
  findTkpApprovalListField,
  resolveTkpApprovalPendingOptionId,
  TKP_APPROVAL_REVISION_KEY,
  TKP_APPROVAL_SUBMITTED_AT_KEY,
  writeTkpApprovalSubmittedPatch,
} from "./tkp-approval";
import { buildTkpApprovalResubmitPatch } from "./tkp-approval-progress";
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
  await assertTkpDocumentApprovalReady({
    entity: input.entity,
    record: input.record,
    entities: input.entities,
    revision: input.revision,
  });

  const target = await resolveTkpDocumentFilesTarget({
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
  const liveValues =
    (
      await getEntityRecordById(
        getEntityConfig().entities.find((item) => item.id === target.entity.id),
        target.record.id,
      )
    )?.values ?? target.record.values;
  let entries = parseEntityTabFileEntries(liveValues[valueKey]);
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

  const approvalPatch = writeTkpApprovalSubmittedPatch({
    entity: target.entity,
    entities: input.entities,
    values: liveValues,
    revisionId: input.revision.id,
  });

  // Only files + approval soft keys (+ optional list field) — never a full
  // form overlay snapshot (task page would rewrite stage → AUTOMATION_BLOCKED).
  const patch: Record<string, string> = {
    [valueKey]: serializeEntityTabFileEntries(entries),
    [TKP_APPROVAL_REVISION_KEY]:
      approvalPatch[TKP_APPROVAL_REVISION_KEY] ?? input.revision.id,
    [TKP_APPROVAL_SUBMITTED_AT_KEY]:
      approvalPatch[TKP_APPROVAL_SUBMITTED_AT_KEY] ?? "",
  };
  if (approvalField && pendingOptionId) {
    patch[approvalField.id] = pendingOptionId;
  }
  Object.assign(
    patch,
    buildTkpApprovalResubmitPatch({
      values: liveValues,
      revisionId: input.revision.id,
    }),
  );

  await updateEntityRecord(target.entity.id, target.record.id, patch);

  return {
    fileName,
    revisionId: input.revision.id,
    approvalFieldUpdated,
    approvalFieldName: approvalField ? approvalField.name.trim() || null : null,
    filesTabName: target.tab.name.trim() || "Файлы",
    createdFilesTab: target.createdTab,
  };
}
