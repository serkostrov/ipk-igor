import { useCallback } from "react";
import {
  applyEntityFieldValue,
  updateEntityRecord,
  useEntityConfig,
  type Entity,
  type EntityField,
  type EntityRecord,
} from "@/entities/entity";

/**
 * Single entry point for changing a list value from views.
 * Render the returned `dialog` once in the view (currently unused).
 */
export function useRecordListChange() {
  const { entities } = useEntityConfig();

  const requestListChange = useCallback(
    (
      entity: Entity,
      record: EntityRecord,
      field: EntityField,
      value: string,
    ): boolean => {
      const from = record.values[field.id] ?? "";
      if (from === value) return true;

      const values = applyEntityFieldValue(
        entity,
        record.values,
        field.id,
        value,
        entities,
      );
      updateEntityRecord(entity.id, record.id, values);
      return true;
    },
    [entities],
  );

  return { requestListChange, dialog: null };
}
