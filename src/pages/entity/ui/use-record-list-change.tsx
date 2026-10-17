import { useCallback, type ReactNode } from "react";
import {
  useEntityConfig,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";
import { applyRecordListChange } from "@/features/automation-tasks/lib/apply-record-list-change";

/**
 * Single entry point for changing a list value from views (table, record, kanban).
 * - Blocks leaving a stage with unfinished blocking automation tasks (opens fill dialog).
 * - Queues the intended stage and applies it after the blocking task is completed.
 * - Applies scenario stage-transition gateways (if / else) from the process map.
 * - After a successful transition, opens the task dialog for the destination stage.
 */
export function useRecordListChange() {
  const { entities } = useEntityConfig();

  const requestListChange = useCallback(
    async (
      entity: Entity,
      record: EntityRecord,
      field: EntityField,
      value: string,
    ): Promise<boolean> => {
      return applyRecordListChange(entity, record, field, value, entities);
    },
    [entities],
  );

  return { requestListChange, dialog: null as ReactNode };
}
