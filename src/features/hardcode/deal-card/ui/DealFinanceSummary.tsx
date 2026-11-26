import { ChevronDown } from "lucide-react";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Loader } from "@/shared/ui/loader";
import { useCurrentRole } from "@/entities/access";
import type { Entity, EntityRecord } from "@/entities/entity";
import { PricingValue } from "../../tkp-commercial/ui/CommercialMetricDetails";
import { useDealCard } from "../lib/use-deal-card";
import { hoursOrDash, moneyOrDash, percentOrDash } from "../model/format";
import { resolveDealCardVisibility } from "../model/visibility";

const OPEN_STORAGE_KEY = "deal-card:finance-summary-open";

function parseOpen(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Collapsed by default; numbers load only once it is expanded. */
export function DealFinanceSummary({
  entity,
  record,
}: {
  entity: Entity;
  record: EntityRecord;
}) {
  const [open, setOpen] = useLocalStorageState(
    OPEN_STORAGE_KEY,
    parseOpen,
    false,
  );

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="self-start text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown
          className={cn("transition-transform", open && "rotate-180")}
        />
        {open ? "Скрыть финансовые показатели" : "Финансовые показатели"}
      </Button>
      {open ? (
        <DealFinanceSummaryContent entity={entity} record={record} />
      ) : null}
    </div>
  );
}

function DealFinanceSummaryContent({
  entity,
  record,
}: {
  entity: Entity;
  record: EntityRecord;
}) {
  const state = useDealCard(entity, record);
  const { showFinance } = resolveDealCardVisibility(
    useCurrentRole(),
    entity.id,
  );

  if (!state.ready) return <Loader block label="Загрузка финансов сделки…" />;
  const { data, view } = state;
  const { financials } = view;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        {financials.source === "contract"
          ? "Суммы по этапам договора"
          : "Суммы из сделки — договор ещё не привязан"}
      </p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <PricingValue
          label="Сумма без НДС"
          value={moneyOrDash(financials.withoutVat)}
        />
        <PricingValue
          label={
            financials.vatRate == null
              ? "НДС"
              : `НДС ${percentOrDash(financials.vatRate)}`
          }
          value={moneyOrDash(financials.vat)}
        />
        <PricingValue
          label="Сумма с НДС"
          value={moneyOrDash(financials.withVat)}
          strong
        />
        <PricingValue
          label="Закрыто актами (с НДС)"
          value={moneyOrDash(view.actsWithVat)}
        />
        <PricingValue
          label="Получено (ДДС)"
          value={moneyOrDash(view.schedule.receivedTotal)}
        />
        <PricingValue
          label="Плановые часы"
          value={hoursOrDash(data.deal.plannedHours)}
        />
        {showFinance ? (
          <>
            <PricingValue
              label="Фактические часы"
              value={hoursOrDash(data.deal.actualHours)}
            />
            <PricingValue
              label="Плановая себестоимость"
              value={moneyOrDash(data.deal.manual.plannedLabor)}
            />
            <PricingValue
              label="Фактическая себестоимость"
              value={moneyOrDash(data.deal.manual.actualLabor)}
            />
            <PricingValue
              label="Плановая рентабельность"
              value={percentOrDash(
                view.profitability.plan.profitabilityPercent,
              )}
            />
            <PricingValue
              label="Фактическая рентабельность"
              value={percentOrDash(
                view.profitability.fact.profitabilityPercent,
              )}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
