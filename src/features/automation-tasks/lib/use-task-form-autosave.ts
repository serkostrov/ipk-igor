import { useCallback, useEffect, useRef, useState } from "react";
import type { AutomationOutcome } from "@/entities/automation";
import { updateEntityRecord, type Entity } from "@/entities/entity";
import {
  buildTaskFormPersistPatch,
  buildTaskRelatedPersistUpdates,
  processTriggerFieldId,
} from "./task-form-persist";
import { persistRelatedAskUpdates } from "./task-related-ask";

const AUTOSAVE_DELAY_MS = 650;

export type TaskFormAutosaveStatus =
  "idle" | "pending" | "saving" | "saved" | "error";

type AutosaveArgs = {
  enabled: boolean;
  entityId: string;
  recordId: string;
  processId: string;
  entity: Entity | null | undefined;
  entities: Entity[];
  outcomes: AutomationOutcome[];
  values: Record<string, string>;
  recordValues: Record<string, string | undefined>;
};

/**
 * Debounced persist of task form values onto the entity record so drafts
 * survive reload / restart. Skips the process trigger field (stage).
 * Also writes related-ask «запись» fields onto linked records.
 */
export function useTaskFormAutosave({
  enabled,
  entityId,
  recordId,
  processId,
  entity,
  entities,
  outcomes,
  values,
  recordValues,
}: AutosaveArgs): {
  status: TaskFormAutosaveStatus;
  error: string | null;
  markDirty: () => void;
  flush: () => Promise<void>;
} {
  const [status, setStatus] = useState<TaskFormAutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const genRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({
    entityId,
    recordId,
    processId,
    entity,
    entities,
    outcomes,
    values,
    recordValues,
  });

  useEffect(() => {
    enabledRef.current = enabled;
    latestRef.current = {
      entityId,
      recordId,
      processId,
      entity,
      entities,
      outcomes,
      values,
      recordValues,
    };
  }, [
    enabled,
    entityId,
    recordId,
    processId,
    entity,
    entities,
    outcomes,
    values,
    recordValues,
  ]);

  const persistNow = useCallback(async (generation: number) => {
    const args = latestRef.current;
    if (!enabledRef.current || !args.entity || !dirtyRef.current) return;

    const patch = buildTaskFormPersistPatch({
      entity: args.entity,
      outcomes: args.outcomes,
      values: args.values,
      excludeFieldIds: [processTriggerFieldId(args.processId)],
      recordValues: args.recordValues,
    });
    const related = buildTaskRelatedPersistUpdates({
      entity: args.entity,
      entities: args.entities,
      outcomes: args.outcomes,
      values: args.values,
      triggerRecordId: args.recordId,
      skipUnchanged: true,
    });

    if (!patch && related.length === 0) {
      if (generation === genRef.current) {
        dirtyRef.current = false;
        setStatus("saved");
      }
      return;
    }

    if (generation === genRef.current) {
      setStatus("saving");
      setError(null);
    }

    try {
      if (patch) {
        await updateEntityRecord(args.entityId, args.recordId, patch);
      }
      await persistRelatedAskUpdates(related);
      if (generation !== genRef.current) return;
      dirtyRef.current = false;
      setStatus("saved");
    } catch (err: unknown) {
      if (generation !== genRef.current) return;
      dirtyRef.current = true;
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить черновик",
      );
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const generation = ++genRef.current;
    await persistNow(generation);
  }, [persistNow]);

  const markDirty = useCallback(() => {
    if (!enabledRef.current) return;
    dirtyRef.current = true;
    setStatus("pending");
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled || !dirtyRef.current) return;
    const generation = ++genRef.current;
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void persistNow(generation);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [values, enabled, persistNow]);

  useEffect(() => {
    if (!enabled) return;

    function onVisibility() {
      if (document.visibilityState === "hidden" && dirtyRef.current) {
        void flush();
      }
    }

    function onPageHide() {
      if (dirtyRef.current) void flush();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (dirtyRef.current) void flush();
    };
  }, [enabled, flush]);

  return { status, error, markDirty, flush };
}

export function taskFormAutosaveLabel(
  status: TaskFormAutosaveStatus,
): string | null {
  if (status === "pending") return "Сохранение…";
  if (status === "saving") return "Сохранение…";
  if (status === "saved") return "Сохранено";
  if (status === "error") return "Ошибка сохранения";
  return null;
}
