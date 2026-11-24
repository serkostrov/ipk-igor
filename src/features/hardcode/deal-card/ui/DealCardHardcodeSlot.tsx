import { Loader } from "@/shared/ui/loader";
import type { Entity, EntityRecord } from "@/entities/entity";
import { useDealCard } from "../lib/use-deal-card";
import type { DealCardSection } from "../model/tabs";
import { DealActsPanel } from "./DealActsPanel";
import { DealCalculationPanel } from "./DealCalculationPanel";
import { DealExpensesPanel } from "./DealExpensesPanel";
import { DealPaymentSchedulePanel } from "./DealPaymentSchedulePanel";

export function DealCardHardcodeSlot({
  entity,
  record,
  section,
  onOpenRelation,
}: {
  entity: Entity;
  record: EntityRecord;
  section: DealCardSection;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const state = useDealCard(entity, record);
  if (!state.ready) return <Loader block label="Загрузка…" />;

  const props = {
    sources: state.sources,
    data: state.data,
    view: state.view,
    onOpenRelation,
  };
  switch (section) {
    case "acts":
      return <DealActsPanel {...props} />;
    case "schedule":
      return <DealPaymentSchedulePanel {...props} />;
    case "expenses":
      return <DealExpensesPanel {...props} />;
    case "calculation":
      return <DealCalculationPanel view={state.view} />;
  }
}
