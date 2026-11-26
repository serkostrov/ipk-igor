/**
 * Promotes «Общий срок расчёта» into the automation task fill form
 * (not buried only inside the TKP «Расчёт ГИПа» card).
 */

import { useMemo } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { useCurrentRole } from "@/entities/access";
import {
  getEntityRecordById,
  updateEntityRecord,
  useEntityConfig,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { GipExecutionDurationControl } from "../../tkp-gip-cost/ui/GipCostSummary";
import {
  readTkpGipExecutionDurationDays,
  writeTkpGipExecutionDurationPatch,
} from "../model/match-related";
import { resolveTkpReviewCostVisibility } from "../model/visibility";

export function TkpGipExecutionDurationAsk({
  entity,
  record,
  readOnly = false,
  required = true,
}: {
  entity: Entity;
  record: EntityRecord;
  readOnly?: boolean;
  required?: boolean;
}) {
  const role = useCurrentRole();
  const visibility = useMemo(
    () => resolveTkpReviewCostVisibility(role, entity.id),
    [entity.id, role],
  );
  const { entities } = useEntityConfig();

  const liveEntity = useMemo(
    () => entities.find((item) => item.id === entity.id) ?? entity,
    [entities, entity],
  );
  const liveRecordValue = useAsyncValue(
    async () => (await getEntityRecordById(liveEntity, record.id)) ?? record,
    [liveEntity, record],
  );
  const liveRecord =
    liveRecordValue.status === "ready" ? liveRecordValue.value : record;

  if (!visibility.showGipCalculation) return null;

  const days = readTkpGipExecutionDurationDays(liveRecord.values, liveEntity);
  const canEdit = !readOnly;

  async function handleSave(next: number) {
    const patch = writeTkpGipExecutionDurationPatch(liveEntity, next);
    await updateEntityRecord(liveEntity.id, liveRecord.id, patch);
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="tkp-gip-duration-ask">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Срок по заданию
      </p>
      <GipExecutionDurationControl
        key={String(days ?? "")}
        executionDurationDays={days}
        canEdit={canEdit}
        required={required && canEdit}
        onSave={canEdit ? handleSave : undefined}
      />
    </div>
  );
}
