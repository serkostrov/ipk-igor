import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  canStartEntityTimer,
  getEntityTimeTracking,
  resolveRelationRecordLabel,
  startRecordTimer,
  stopRunningTimer,
  useEntityConfig,
  useRunningTimer,
  type Entity,
  type EntityRecord,
  type EntityRunningTimer,
} from "@/entities/entity";

export type RecordTimers = {
  enabled: boolean;
  running: EntityRunningTimer | null;
  /** Record of this entity whose timer runs now. */
  runningRecordId: string | null;
  canStart: (record: EntityRecord) => boolean;
  toggle: (record: EntityRecord) => void;
  dialog: ReactNode;
};

/** Start / stop timers on records of one entity (one confirm dialog per view). */
export function useRecordTimers(entity: Entity): RecordTimers {
  const { entities } = useEntityConfig();
  const running = useRunningTimer();
  const setup = getEntityTimeTracking(entity, entities);
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const runningRecordId =
    running?.entity.id === entity.id ? (running.record?.id ?? null) : null;

  function canStart(record: EntityRecord) {
    return (
      setup != null &&
      canStartEntityTimer(setup.config, record, entity, entities)
    );
  }

  function toggle(record: EntityRecord) {
    if (!setup) return;
    if (runningRecordId === record.id) {
      stopRunningTimer();
      return;
    }
    if (!canStart(record)) return;
    if (running) {
      setPendingRecordId(record.id);
      return;
    }
    startRecordTimer(entity.id, record.id);
  }

  const runningTitle = running?.record
    ? resolveRelationRecordLabel(running.entity, running.record.id)
    : null;

  return {
    enabled: setup != null,
    running,
    runningRecordId,
    canStart,
    toggle,
    dialog: (
      <ConfirmDialog
        open={pendingRecordId != null}
        onOpenChange={(open) => {
          if (!open) setPendingRecordId(null);
        }}
        title="Переключить таймер?"
        description={`Сейчас идёт таймер${runningTitle ? ` «${runningTitle}»` : ""}. Остановить его и запустить таймер здесь?`}
        confirmLabel="Переключить"
        destructive={false}
        onConfirm={() => {
          if (pendingRecordId) startRecordTimer(entity.id, pendingRecordId);
        }}
      />
    ),
  };
}
