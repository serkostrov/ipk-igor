import { useMemo } from "react";
import {
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityCashFlowPeriod,
  type EntityRecord,
} from "@/entities/entity";
import {
  buildDdsWalletSummaryRows,
  resolveDdsWalletSummarySetup,
} from "../dds/wallet-summary/model";
import { DdsWalletSummaryTable } from "../dds/wallet-summary/ui";

type HardcodeTimelineSlotProps = {
  entity: Entity;
  /** Records with non-date filters applied (date filter stripped for opening). */
  historyRecords: EntityRecord[];
  period: EntityCashFlowPeriod;
};

/**
 * Hardcode extras above the timeline grid. Currently: DDS wallet summary.
 * Renders null when the entity/config does not match.
 */
export function HardcodeTimelineSlot({
  entity,
  historyRecords,
  period,
}: HardcodeTimelineSlotProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();

  const setup = useMemo(
    () => resolveDdsWalletSummarySetup(entity, entities),
    [entity, entities],
  );

  const rows = useMemo(() => {
    if (!setup) return [];
    return buildDdsWalletSummaryRows(
      valueContext,
      entity,
      historyRecords,
      setup,
      period,
    );
  }, [entity, historyRecords, period, setup, valueContext]);

  if (!setup) return null;

  if (rows.length === 0) {
    return (
      <div className="shrink-0 rounded-xl border border-border bg-card px-3 py-4 text-center text-sm text-muted-foreground shadow-xs">
        Нет данных по кошелькам за выбранный период
      </div>
    );
  }

  return (
    <div className="shrink-0">
      <DdsWalletSummaryTable rows={rows} />
    </div>
  );
}

export type { HardcodeTimelineSlotProps };
