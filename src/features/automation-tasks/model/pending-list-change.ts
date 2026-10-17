/**
 * When the user tries to change a list/stage field but blocking automation
 * tasks stop the move, we keep the intended change and apply it after those
 * tasks are completed.
 */

export type PendingRecordListChange = {
  entityId: string;
  recordId: string;
  fieldId: string;
  /** Serialized list value the user chose (after transition redirects). */
  value: string;
};

type Applier = (pending: PendingRecordListChange) => Promise<boolean>;

let pending: PendingRecordListChange | null = null;
let applier: Applier | null = null;
let resumeInFlight: Promise<boolean> | null = null;

export function getPendingRecordListChange() {
  return pending;
}

export function queuePendingRecordListChange(change: PendingRecordListChange) {
  pending = change;
}

export function clearPendingRecordListChange(
  match?: Pick<PendingRecordListChange, "recordId" | "fieldId">,
) {
  if (!pending) return;
  if (
    match &&
    (pending.recordId !== match.recordId || pending.fieldId !== match.fieldId)
  ) {
    return;
  }
  pending = null;
}

/**
 * Register the applier from the list-change hook (entity/record context).
 * Returns an unsubscribe that clears the handler when the hook unmounts.
 */
export function registerPendingRecordListChangeApplier(handler: Applier) {
  applier = handler;
  return () => {
    if (applier === handler) applier = null;
  };
}

/**
 * Retry a deferred stage move after an automation task for this record is done.
 * Safe to call often — no-ops when nothing is queued or another resume runs.
 */
export async function resumePendingRecordListChange(
  recordId?: string,
): Promise<boolean> {
  const current = pending;
  if (!current || !applier) return false;
  if (recordId && current.recordId !== recordId) return false;
  if (resumeInFlight) return resumeInFlight;

  resumeInFlight = (async () => {
    try {
      const ok = await applier!(current);
      if (ok) {
        clearPendingRecordListChange({
          recordId: current.recordId,
          fieldId: current.fieldId,
        });
      }
      return ok;
    } finally {
      resumeInFlight = null;
    }
  })();

  return resumeInFlight;
}
