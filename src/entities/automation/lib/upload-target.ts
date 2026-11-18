/**
 * Upload target for task completion files — stored in
 * `AutomationTaskTemplate.materials` (no extra DB column), like time-tracking.
 *
 * Format: `uploadTarget:<filesTabId>:<folderId|*>[:required]`
 * - `folderId` — `EntityTab.defaultFolders[].id`, or `*` for tab root
 *
 * Prefer this over a «файл» ask-field: uploads land on the entity Files tab
 * and are visible during acceptance (рукО / view tabs).
 */

import {
  isEntityFilesTab,
  type Entity,
  type EntityFilesUploadTarget,
} from "@/entities/entity";

export const AUTOMATION_UPLOAD_TARGET_PREFIX = "uploadTarget:";

/** Same shape as entity create-upload target. */
export type AutomationTaskUploadTarget = EntityFilesUploadTarget;

function encodeUploadTarget(target: AutomationTaskUploadTarget): string {
  const folderKey = target.folderId.trim() || "*";
  const base = `${AUTOMATION_UPLOAD_TARGET_PREFIX}${target.filesTabId.trim()}:${folderKey}`;
  return target.required ? `${base}:required` : base;
}

function parseUploadTargetToken(
  token: string,
): AutomationTaskUploadTarget | null {
  if (!token.startsWith(AUTOMATION_UPLOAD_TARGET_PREFIX)) return null;
  const rest = token.slice(AUTOMATION_UPLOAD_TARGET_PREFIX.length);
  const parts = rest.split(":");
  const filesTabId = parts[0]?.trim() ?? "";
  if (!filesTabId) return null;
  const folderRaw = parts[1]?.trim() ?? "*";
  const folderId = folderRaw === "*" || folderRaw === "" ? "" : folderRaw;
  const required = parts.slice(2).includes("required");
  return { filesTabId, folderId, required };
}

export function getAutomationUploadTarget(
  materials: string[] | undefined | null,
): AutomationTaskUploadTarget | null {
  for (const item of materials ?? []) {
    const parsed = parseUploadTargetToken(item);
    if (parsed) return parsed;
  }
  return null;
}

export function setAutomationUploadTarget(
  materials: string[],
  target: AutomationTaskUploadTarget | null,
): string[] {
  const next = materials.filter(
    (item) => !item.startsWith(AUTOMATION_UPLOAD_TARGET_PREFIX),
  );
  if (
    target &&
    target.filesTabId.trim() &&
    (target.folderId.trim() || target.folderId === "")
  ) {
    next.push(
      encodeUploadTarget({
        filesTabId: target.filesTabId.trim(),
        folderId: target.folderId.trim(),
        required: target.required === true,
      }),
    );
  }
  return next;
}

/**
 * Effective upload target for a task. Falls back to the first files tab when
 * legacy `requireAttachment` is set but materials have no uploadTarget yet.
 */
export function resolveEffectiveUploadTarget(options: {
  materials?: string[] | null;
  requireAttachment?: boolean;
  entity?: Entity | null;
}): AutomationTaskUploadTarget | null {
  const fromMaterials = getAutomationUploadTarget(options.materials);
  if (fromMaterials) return fromMaterials;
  if (!options.requireAttachment || !options.entity) return null;
  const tab = options.entity.tabs.find((item) => isEntityFilesTab(item));
  if (!tab) return null;
  return {
    filesTabId: tab.id,
    folderId: tab.defaultFolders[0]?.id ?? "",
    required: true,
  };
}
