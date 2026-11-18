import {
  getEntityConfig,
  getEntityTabFilesValueKey,
  parseEntityTabFileEntries,
  updateEntityRecord,
  uploadFilesToFilesTabEntries,
  type Entity,
  type EntityFilesUploadTarget,
  type EntityRecord,
  type EntityTab,
} from "@/entities/entity";

export {
  countFilesUnderFolder,
  listFilesUnderFolder,
  type UploadTargetFileItem,
} from "@/entities/entity";
export { ensureUploadTargetFolderId } from "@/entities/entity";

/**
 * Upload files into the configured files-tab folder and persist on the record.
 */
export async function uploadFilesToAutomationTarget(input: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
  target: EntityFilesUploadTarget;
  files: FileList | File[];
}): Promise<{ uploadedCount: number; folderParentId: string | null }> {
  const valueKey = getEntityTabFilesValueKey(input.tab.id);
  const latestValues =
    getEntityConfig()
      .entities.find((item) => item.id === input.entity.id)
      ?.records.find((item) => item.id === input.record.id)?.values ??
    input.record.values;

  const result = await uploadFilesToFilesTabEntries({
    entityId: input.entity.id,
    recordId: input.record.id,
    tab: input.tab,
    target: input.target,
    files: input.files,
    entries: parseEntityTabFileEntries(latestValues[valueKey]),
  });

  await updateEntityRecord(input.entity.id, input.record.id, {
    [result.valueKey]: result.serialized,
  });

  return {
    uploadedCount: result.uploadedCount,
    folderParentId: result.folderParentId,
  };
}
