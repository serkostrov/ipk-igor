/**
 * Normalize / resolve create-dialog Files-tab upload targets.
 */

import {
  isEntityFilesTab,
  type EntityFilesUploadTarget,
  type EntityTab,
} from "../model/types";

export type { EntityFilesUploadTarget };

export function normalizeEntityFilesUploadTarget(
  value: unknown,
): EntityFilesUploadTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const filesTabId =
    typeof raw.filesTabId === "string" ? raw.filesTabId.trim() : "";
  if (!filesTabId) return null;
  const folderId = typeof raw.folderId === "string" ? raw.folderId.trim() : "";
  return {
    filesTabId,
    folderId,
    required: raw.required === true,
  };
}

/**
 * Keep create-upload only when the files tab (and folder, if set) still exist.
 */
export function resolveEntityCreateUpload(
  tabs: readonly EntityTab[],
  value: unknown,
): EntityFilesUploadTarget | null {
  const target = normalizeEntityFilesUploadTarget(value);
  if (!target) return null;
  const tab = tabs.find(
    (item) => item.id === target.filesTabId && isEntityFilesTab(item),
  );
  if (!tab) return null;
  const folderId = target.folderId.trim();
  if (
    folderId &&
    !tab.defaultFolders.some((folder) => folder.id === folderId)
  ) {
    return {
      filesTabId: tab.id,
      folderId: tab.defaultFolders[0]?.id ?? "",
      required: target.required,
    };
  }
  return {
    filesTabId: tab.id,
    folderId,
    required: target.required,
  };
}
