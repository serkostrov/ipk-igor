import type { Entity, EntityValueContext } from "@/entities/entity";
import { resolvePaymentCalendarSources } from "../match";
import { createDdsOperationReader, type DdsOperationDraft } from "./collect";

/**
 * ДДС operation as it is in the form right now (values may not be saved yet).
 * `null` when `entity` is not the ДДС operations entity the calendar reads.
 */
export function readDdsOperationFromValues(
  ctx: EntityValueContext,
  entities: readonly Entity[],
  entity: Entity,
  recordId: string,
  values: Record<string, string>,
): DdsOperationDraft | null {
  const sources = resolvePaymentCalendarSources(entities);
  if (!sources || sources.dds?.id !== entity.id) return null;
  const read = createDdsOperationReader(ctx, sources);
  return (
    read?.({
      id: recordId,
      values,
      authUserId: null,
      createdBy: null,
      schemaVersion: 1,
    }) ?? null
  );
}
