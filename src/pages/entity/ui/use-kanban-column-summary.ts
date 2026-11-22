import { useMemo } from "react";
import type {
  Entity,
  EntityRecord,
  EntityValueContext,
} from "@/entities/entity";
import { getPaymentRequestDraftSummary } from "@/features/hardcode";

export function useKanbanColumnSummary(
  ctx: EntityValueContext,
  entity: Entity,
  groupFieldId: string,
  columnId: string,
  records: readonly EntityRecord[],
): string | number {
  return useMemo(
    () =>
      getPaymentRequestDraftSummary(
        ctx,
        entity,
        groupFieldId,
        columnId,
        records,
      ) ?? records.length,
    [ctx, entity, groupFieldId, columnId, records],
  );
}
