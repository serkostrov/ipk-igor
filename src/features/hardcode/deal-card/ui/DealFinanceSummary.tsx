import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { notifyError } from "@/shared/lib/notify";
import { pluralRu } from "@/shared/lib/plural";
import { Button } from "@/shared/ui/button";
import { Loader } from "@/shared/ui/loader";
import { useCanEntity, useCurrentRole } from "@/entities/access";
import {
  getEntityRecordTitle,
  useEntityValueContext,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { PricingValue } from "../../tkp-commercial/ui/CommercialMetricDetails";
import { createProjectFromDeal } from "../lib/create-project-from-deal";
import { useDealCard } from "../lib/use-deal-card";
import { hoursOrDash, moneyOrDash, percentOrDash } from "../model/format";
import { resolveDealCardVisibility } from "../model/visibility";
import { DealRecordLink } from "./shared";

/** Financial block above the deal tabs (port of the ipk-igor card header). */
export function DealFinanceSummary({
  entity,
  record,
  onOpenRelation,
}: {
  entity: Entity;
  record: EntityRecord;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const state = useDealCard(entity, record);
  const ctx = useEntityValueContext();
  const visibility = resolveDealCardVisibility(useCurrentRole());
  const projectEntity = state.sources.project;
  const canCreateProjectRecord = useCanEntity(
    projectEntity?.id ?? "",
    "create",
  );
  const canCreateProject =
    projectEntity != null &&
    visibility.canCreateProject &&
    canCreateProjectRecord;
  const [creating, setCreating] = useState(false);

  if (!state.ready) return <Loader block label="Загрузка финансов сделки…" />;
  const { data, view } = state;
  const { financials } = view;

  async function handleCreateProject() {
    if (!state.ready || !projectEntity) return;
    setCreating(true);
    try {
      const result = await createProjectFromDeal({
        ctx,
        sources: state.sources,
        dealRecord: record,
        dealTitle: getEntityRecordTitle(ctx, entity, record, "Проект"),
        data: state.data,
      });
      toast.success(
        result.linkedStages > 0
          ? `Проект создан, привязано ${result.linkedStages} ${pluralRu(result.linkedStages, "этап", "этапа", "этапов")} договора`
          : "Проект создан. Этапов договора для привязки нет",
      );
      onOpenRelation?.(projectEntity.id, result.projectId);
    } catch (error) {
      notifyError("Не удалось создать проект", error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Финансовые показатели сделки
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {financials.source === "contract"
              ? "Суммы по этапам договора"
              : "Суммы из сделки — договор ещё не привязан"}
          </p>
        </div>
        {canCreateProject ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={creating}
            onClick={() => void handleCreateProject()}
          >
            <FolderPlus />
            {creating ? "Создание…" : "Создать проект"}
          </Button>
        ) : null}
      </div>

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
        {visibility.showFinance ? (
          <>
            <PricingValue
              label="Фактические часы"
              value={hoursOrDash(data.deal.actualHours)}
            />
            <PricingValue
              label="Плановая себестоимость"
              value={moneyOrDash(data.deal.plannedCost)}
            />
            <PricingValue
              label="Фактическая себестоимость"
              value={moneyOrDash(data.deal.actualCost)}
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

      {data.projects.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Проекты:</span>
          {data.projects.map((project) => (
            <DealRecordLink
              key={project.id}
              entityId={projectEntity?.id}
              recordId={project.id}
              title={project.title}
              onOpenRelation={onOpenRelation}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
