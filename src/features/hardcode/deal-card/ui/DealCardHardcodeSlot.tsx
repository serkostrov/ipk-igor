import { useMemo } from "react";
import { Loader } from "@/shared/ui/loader";
import {
  useEntityConfig,
  type Entity,
  type EntityRecord,
  type EntityTab,
} from "@/entities/entity";
import { useDealCard } from "../lib/use-deal-card";
import { isDealsEntity, resolveDealCardSources } from "../match";
import { getDealLinkedTabSection, type DealCardSection } from "../model/tabs";
import { DealCalculationPanel } from "./DealCalculationPanel";
import { DealExpenseCategoriesPanel } from "./DealExpenseCategoriesPanel";
import { DealPaymentPlanPanel } from "./DealPaymentPlanPanel";
import { DealRequestsPanel } from "./DealRequestsPanel";

type SlotProps = {
  entity: Entity;
  record: EntityRecord;
  onOpenRelation?: (entityId: string, recordId: string) => void;
};

/** Content of a virtual deal tab or the block above a configured one. */
export function DealCardHardcodeSlot({
  entity,
  record,
  section,
  onOpenRelation,
}: SlotProps & { section: DealCardSection }) {
  const state = useDealCard(entity, record);
  if (!state.ready) return <Loader block label="Загрузка…" />;

  switch (section) {
    case "payments":
      return (
        <DealPaymentPlanPanel
          sources={state.sources}
          data={state.data}
          view={state.view}
          onOpenRelation={onOpenRelation}
        />
      );
    case "expenses":
      return (
        <div className="flex flex-col gap-4">
          <DealExpenseCategoriesPanel view={state.view} />
          <DealRequestsPanel
            sources={state.sources}
            data={state.data}
            onOpenRelation={onOpenRelation}
          />
        </div>
      );
    case "expense-totals":
      return <DealExpenseCategoriesPanel view={state.view} />;
    case "calculation":
      return (
        <DealCalculationPanel
          sources={state.sources}
          record={record}
          data={state.data}
          view={state.view}
        />
      );
  }
}

/**
 * Extra block above a configured deal tab (ДДС → plan of receipts,
 * «Заявки на оплату» → expense totals). Renders nothing for other tabs.
 */
export function DealLinkedTabExtras({
  entity,
  record,
  tab,
  onOpenRelation,
}: SlotProps & { tab: EntityTab }) {
  const { entities } = useEntityConfig();
  const section = useMemo(
    () =>
      isDealsEntity(entity)
        ? getDealLinkedTabSection(tab, resolveDealCardSources(entity, entities))
        : null,
    [entity, entities, tab],
  );
  if (!section) return null;
  return (
    <div className="mb-4">
      <DealCardHardcodeSlot
        entity={entity}
        record={record}
        section={section}
        onOpenRelation={onOpenRelation}
      />
    </div>
  );
}
