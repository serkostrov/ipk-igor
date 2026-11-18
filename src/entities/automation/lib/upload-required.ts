import type { Entity, EntityRecord } from "@/entities/entity";
import { entityFilesUploadTargetBlocksRecord } from "@/entities/entity";
import {
  getAutomationUploadTarget,
  type AutomationTaskUploadTarget,
} from "./upload-target";

export {
  countFilesUnderUploadFolder,
  resolveUploadTargetFolderId,
} from "@/entities/entity";

/**
 * True when upload is required and the target folder still has no files.
 * Missing entity/record/tab/folder config → blocks (cannot verify).
 */
export function automationUploadTargetBlocksComplete(
  entity: Entity | undefined,
  record: EntityRecord | undefined,
  target: AutomationTaskUploadTarget | null,
): boolean {
  return entityFilesUploadTargetBlocksRecord(entity, record, target);
}

/** Throw when the task materials require a file that is still missing. */
export function assertAutomationUploadRequired(
  materials: string[] | undefined | null,
  entity: Entity | undefined,
  record: EntityRecord | undefined,
): void {
  const target = getAutomationUploadTarget(materials);
  if (automationUploadTargetBlocksComplete(entity, record, target)) {
    throw new Error("Прикрепите файлы в папку задания, чтобы завершить его.");
  }
}
