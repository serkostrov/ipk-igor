/**
 * Upload target for task completion files — stored in
 * `AutomationTaskTemplate.materials` (no extra DB column), like time-tracking.
 *
 * Format: `uploadTarget:<filesTabId>:<folderId|*>[:required]`
 * - `folderId` — `EntityTab.defaultFolders[].id`, or `*` for tab root
 */

export const AUTOMATION_UPLOAD_TARGET_PREFIX = "uploadTarget:";

export type AutomationTaskUploadTarget = {
  /** Files tab on the process entity. */
  filesTabId: string;
  /**
   * Default-folder id from the tab (`EntityTabDefaultFolder.id`).
   * Empty string = root of the files tab («Без папки»).
   */
  folderId: string;
  /** Block complete until the target folder has at least one file. */
  required: boolean;
};

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
