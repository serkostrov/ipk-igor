import { useCallback } from "react";
import type { AutomationTaskUploadTarget } from "@/entities/automation";
import {
  EntityFilesUploadPanel,
  updateEntityRecord,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";

type TaskUploadPanelProps = {
  entity: Entity;
  record: EntityRecord;
  target: AutomationTaskUploadTarget;
  disabled?: boolean;
  onError?: (message: string | null) => void;
};

/**
 * Automation task upload: persists `__tab_files__` onto the live record.
 */
export function TaskUploadPanel({
  entity,
  record,
  target,
  disabled = false,
  onError,
}: TaskUploadPanelProps) {
  const handleValuesChange = useCallback(
    (next: Record<string, string>) => {
      const patched: Record<string, string> = {};
      for (const [key, value] of Object.entries(next)) {
        if (record.values[key] !== value) patched[key] = value;
      }
      if (Object.keys(patched).length === 0) return;
      void updateEntityRecord(entity.id, record.id, patched).catch(
        (err: unknown) => {
          onError?.(
            err instanceof Error ? err.message : "Не удалось сохранить файлы",
          );
        },
      );
    },
    [entity.id, onError, record.id, record.values],
  );

  return (
    <EntityFilesUploadPanel
      entity={entity}
      recordId={record.id}
      values={record.values}
      target={target}
      disabled={disabled}
      onValuesChange={handleValuesChange}
      onError={onError}
    />
  );
}
