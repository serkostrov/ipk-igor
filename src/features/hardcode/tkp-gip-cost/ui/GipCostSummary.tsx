import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  formatReviewExecutionDuration,
  parseReviewExecutionDuration,
} from "../model/execution-duration";
import { reviewExpenseCategoryLabel } from "../model/expense-category";
import type {
  ReviewGipCostCalculation,
  ReviewGipCostCalculationV1,
  ReviewGipCostCalculationV2,
  ReviewGipCostCalculationV3,
  ReviewGipCostGroup,
  ReviewGipCostItem,
} from "../model/gip-cost";
import { reviewGipTotalAmount } from "../model/gip-cost";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(
    value,
  );
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatFixedRate(value: number): string {
  return formatPercent(value <= 1 ? value * 100 : value);
}

type CurrentReviewGipCostCalculation =
  ReviewGipCostCalculationV2 | ReviewGipCostCalculationV3;

function isCurrentCalculation(
  calculation: ReviewGipCostCalculation,
): calculation is CurrentReviewGipCostCalculation {
  return (
    calculation.calculationVersion === 2 || calculation.calculationVersion === 3
  );
}

export function GipCostSummary({
  calculation,
  executionDurationDays,
  canEditExecutionDuration = false,
  onSaveExecutionDuration,
}: {
  calculation: ReviewGipCostCalculation;
  executionDurationDays?: number | null;
  canEditExecutionDuration?: boolean;
  onSaveExecutionDuration?: (days: number) => Promise<void>;
}) {
  const durationControl = (
    <GipExecutionDurationControl
      key={String(executionDurationDays ?? "")}
      executionDurationDays={executionDurationDays ?? null}
      canEdit={canEditExecutionDuration}
      onSave={onSaveExecutionDuration}
    />
  );
  return isCurrentCalculation(calculation) ? (
    <CurrentCostSummary
      calculation={calculation}
      durationControl={durationControl}
    />
  ) : (
    <HistoricalCostSummary
      calculation={calculation}
      durationControl={durationControl}
    />
  );
}

function CurrentCostSummary({
  calculation,
  durationControl,
}: {
  calculation: CurrentReviewGipCostCalculation;
  durationControl: ReactNode;
}) {
  const laborGroups = calculation.groups.filter(
    (group) => group.key === "labor",
  );
  const expenseGroups = calculation.groups.filter(
    (group) => group.key === "expenses_and_trips",
  );
  const fixedBaseGroups = calculation.groups.filter(
    (group) => group.treatment === "fixed_base",
  );
  const contractorGroups = calculation.groups.filter(
    (group) => group.treatment === "separate_after_fixed",
  );

  return (
    <SummaryShell
      description="Состав каждой суммы раскрывается до отдела и строки расчёта."
      durationControl={durationControl}
    >
      <MetricDetails
        metricKey="labor"
        label="Стоимость трудозатрат"
        value={calculation.laborCost}
      >
        <GroupComposition
          groups={laborGroups}
          emptyText="Строки трудозатрат не добавлены."
          idPrefix="labor"
        />
      </MetricDetails>

      <MetricDetails
        metricKey="expenses"
        label="Расходы и командировки"
        value={calculation.expensesAndTrips}
      >
        <GroupComposition
          groups={expenseGroups}
          emptyText="Расходы и командировки не добавлены."
          idPrefix="expenses"
        />
      </MetricDetails>

      <MetricDetails
        metricKey="before-fixed"
        label="Расходы по проекту до FIX 30%"
        value={calculation.costBeforeFixed}
      >
        <GroupComposition
          groups={fixedBaseGroups}
          emptyText="Строки расчёта не добавлены."
          idPrefix="before-fixed"
        />
      </MetricDetails>

      <MetricDetails
        metricKey="fixed"
        label="FIX 30%"
        value={calculation.fixedAmount}
      >
        <FormulaBreakdown
          rows={[
            {
              label: "Расходы по проекту до FIX 30%",
              value: calculation.costBeforeFixed,
            },
            {
              label: "Ставка FIX",
              value: formatFixedRate(calculation.fixedRate),
            },
            { label: "FIX 30%", value: calculation.fixedAmount },
          ]}
        />
        <GroupComposition
          groups={fixedBaseGroups}
          emptyText="Строки расчёта не добавлены."
          idPrefix="fixed"
        />
      </MetricDetails>

      <MetricDetails
        metricKey="project-cost"
        label="Стоимость проекта с FIX 30%"
        value={calculation.projectCost}
      >
        <FormulaBreakdown
          rows={[
            {
              label: "Расходы по проекту до FIX 30%",
              value: calculation.costBeforeFixed,
            },
            { label: "FIX 30%", value: calculation.fixedAmount },
            {
              label: "Стоимость проекта с FIX 30%",
              value: calculation.projectCost,
            },
          ]}
        />
        <GroupComposition
          groups={fixedBaseGroups}
          emptyText="Строки расчёта не добавлены."
          idPrefix="project-cost"
        />
      </MetricDetails>

      <MetricDetails
        metricKey="contractor"
        label="Подрядные блоки"
        value={calculation.contractorTotalAfterCoefficient}
      >
        <GroupComposition
          groups={contractorGroups}
          emptyText="Подрядные работы не добавлены."
          idPrefix="contractor"
        />
      </MetricDetails>

      <MetricDetails
        metricKey="total"
        label="Общая себестоимость с FIX 30% и подрядными блоками"
        value={reviewGipTotalAmount(calculation)}
      >
        <FormulaBreakdown
          rows={[
            {
              label: "Стоимость проекта с FIX 30%",
              value: calculation.projectCost,
            },
            {
              label: "Подрядные блоки",
              value: calculation.contractorTotalAfterCoefficient,
            },
            {
              label: "Общая себестоимость",
              value: reviewGipTotalAmount(calculation),
            },
          ]}
        />
      </MetricDetails>
    </SummaryShell>
  );
}

function HistoricalCostSummary({
  calculation,
  durationControl,
}: {
  calculation: ReviewGipCostCalculationV1;
  durationControl: ReactNode;
}) {
  const unavailable = (
    <p className="text-xs text-muted-foreground">
      Детализация недоступна для исторической версии расчёта.
    </p>
  );

  return (
    <SummaryShell
      description="Историческая версия расчёта сохранена без состава строк."
      durationControl={durationControl}
    >
      <MetricDetails
        metricKey="labor"
        label="Стоимость трудозатрат"
        value={calculation.laborCost}
      >
        {unavailable}
      </MetricDetails>
      <MetricDetails
        metricKey="expenses"
        label="Расходы и командировки"
        value={calculation.expensesAndTrips}
      >
        {unavailable}
      </MetricDetails>
      <MetricDetails
        metricKey="before-fixed"
        label="Расходы по проекту до FIX 30%"
        value={calculation.upperBase}
      >
        {unavailable}
      </MetricDetails>
      <MetricDetails
        metricKey="fixed"
        label="FIX 30%"
        value={calculation.fixedAmount}
      >
        {unavailable}
      </MetricDetails>
      <MetricDetails
        metricKey="project-cost"
        label="Стоимость проекта с FIX 30%"
        value={calculation.costWithFixed}
      >
        {unavailable}
      </MetricDetails>
      <MetricDetails
        metricKey="total"
        label="Общая себестоимость с FIX 30% и подрядными блоками"
        value={reviewGipTotalAmount(calculation)}
      >
        {unavailable}
      </MetricDetails>
    </SummaryShell>
  );
}

function SummaryShell({
  description,
  durationControl,
  children,
}: {
  description: string;
  durationControl: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-4 rounded-md border bg-card p-4"
      data-testid="review-gip-cost-summary"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Расчёт ГИПа</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {durationControl}
      </div>
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-5">
        {children}
      </div>
    </section>
  );
}

function GipExecutionDurationControl({
  executionDurationDays,
  canEdit,
  onSave,
}: {
  executionDurationDays: number | null;
  canEdit: boolean;
  onSave?: (days: number) => Promise<void>;
}) {
  const [value, setValue] = useState(executionDurationDays?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsed = parseReviewExecutionDuration(value);
    if (parsed === null) {
      setError("Укажите положительный срок с шагом 0,5 рабочего дня");
      return;
    }
    if (!onSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed);
      toast.success("Общий срок выполнения ГИПа сохранён");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-w-0 rounded-md border border-primary/30 bg-primary/5 p-3 lg:min-w-[23rem]"
      data-testid="review-gip-execution-duration"
    >
      <Label htmlFor="review-gip-execution-duration">
        Общий срок выполнения, раб. дни
      </Label>
      {canEdit ? (
        <div className="mt-2 flex gap-2">
          <Input
            id="review-gip-execution-duration"
            data-testid="review-gip-execution-duration-input"
            type="number"
            min="0.5"
            step="0.5"
            required
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={
              value.trim().length > 0 &&
              parseReviewExecutionDuration(value) === null
            }
          />
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !onSave}
            data-testid="review-gip-execution-duration-save"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      ) : (
        <div className="mt-1 text-sm font-semibold tabular-nums">
          {formatReviewExecutionDuration(executionDurationDays)}
        </div>
      )}
      {error ? (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Вводится вручную и не влияет на стоимость расчёта.
        </p>
      )}
    </div>
  );
}

function MetricDetails({
  metricKey,
  label,
  value,
  children,
}: {
  metricKey: string;
  label: string;
  value: number;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-md border bg-background open:col-span-full"
      data-testid={`review-gip-metric-${metricKey}`}
    >
      <summary
        className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-md px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        data-cost-label={label}
      >
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(value)}
        </span>
      </summary>
      <div className="space-y-4 border-t px-3 py-4">{children}</div>
    </details>
  );
}

function FormulaBreakdown({
  rows,
}: {
  rows: Array<{ label: string; value: number | string }>;
}) {
  return (
    <dl className="grid gap-2 rounded-md bg-muted/30 p-3 text-sm sm:grid-cols-3">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 sm:block"
        >
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="font-medium tabular-nums">
            {typeof row.value === "number" ? formatMoney(row.value) : row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function GroupComposition({
  groups,
  emptyText,
  idPrefix,
}: {
  groups: ReviewGipCostGroup[];
  emptyText: string;
  idPrefix: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <CostGroup
          key={`${idPrefix}-${group.key}`}
          group={group}
          headingId={`${idPrefix}-${group.key}-heading`}
        />
      ))}
    </div>
  );
}

function CostGroup({
  group,
  headingId,
}: {
  group: ReviewGipCostGroup;
  headingId: string;
}) {
  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-semibold">
          {group.label}
        </h3>
        <div className="text-right tabular-nums">
          <div className="text-sm font-semibold">
            {formatMoney(group.subtotalBeforeCoefficient)}
          </div>
          {group.coefficientAdjustment !== 0 ? (
            <div className="text-[11px] text-muted-foreground">
              После коэффициента: {formatMoney(group.totalAfterCoefficient)}
            </div>
          ) : null}
        </div>
      </div>

      {group.items.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
          Строки этой категории не добавлены.
        </div>
      ) : group.key === "contractor" ? (
        <ContractorItems items={group.items} caption={group.label} />
      ) : (
        <DepartmentItems
          items={group.items}
          groupKey={group.key}
          caption={group.label}
        />
      )}

      <GroupTotals group={group} />
    </section>
  );
}

function DepartmentItems({
  items,
  groupKey,
  caption,
}: {
  items: ReviewGipCostItem[];
  groupKey: Exclude<ReviewGipCostGroup["key"], "contractor">;
  caption: string;
}) {
  return (
    <div className="space-y-3">
      {groupByDepartment(items).map((department) => (
        <section key={department.key} className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">
            {department.label}
          </h4>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-[760px] w-full table-fixed text-sm">
              <caption className="sr-only">
                {caption}: {department.label}
              </caption>
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[18%]" />
                {groupKey === "labor" ? (
                  <>
                    <col className="w-[10%]" />
                    <col className="w-[13%]" />
                  </>
                ) : (
                  <col className="w-[23%]" />
                )}
                <col className="w-[14%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Строка
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Этап
                  </th>
                  {groupKey === "labor" ? (
                    <>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        Часы
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        Ставка
                      </th>
                    </>
                  ) : (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Категория
                    </th>
                  )}
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Исходная сумма
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Итог
                  </th>
                </tr>
              </thead>
              <tbody>
                {department.items.map((item, index) => (
                  <tr
                    key={
                      item.sourceId ??
                      item.lineId ??
                      `${department.key}-${index}`
                    }
                    className="border-t"
                  >
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <div>{item.title}</div>
                      <div className="text-[11px] font-normal text-muted-foreground">
                        {sourceKindLabel(item.sourceKind)}
                      </div>
                    </th>
                    <td className="px-3 py-2">
                      {item.projectStageName ?? "—"}
                    </td>
                    {groupKey === "labor" ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(item.plannedHours)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.hourlyRate === null
                            ? "—"
                            : formatMoney(item.hourlyRate)}
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-2">
                        {reviewExpenseCategoryLabel(item.category) ??
                          "Без категории"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(item.sourceAmount)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(item.amountAfterCoefficient)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function ContractorItems({
  items,
  caption,
}: {
  items: ReviewGipCostItem[];
  caption: string;
}) {
  return (
    <div className="space-y-4">
      {groupContractorItems(items).map((category) => (
        <section key={category.key} className="space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground">
            {category.label}
          </h4>
          {groupByDepartment(category.items).map((department) => (
            <div
              key={`${category.key}-${department.key}`}
              className="space-y-2"
            >
              <h5 className="text-xs font-medium">{department.label}</h5>
              <div className="overflow-x-auto rounded-md border">
                <table className="min-w-[980px] w-full table-fixed text-sm">
                  <caption className="sr-only">
                    {caption}, {category.label}: {department.label}
                  </caption>
                  <colgroup>
                    <col className="w-[32%]" />
                    <col className="w-[18%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Строка
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Этап
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        Исходная сумма
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        Налог
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        До коэффициента
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        Коэффициент
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        После коэффициента
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {department.items.map((item, index) => (
                      <tr
                        key={
                          item.sourceId ??
                          item.lineId ??
                          `${department.key}-${index}`
                        }
                        className="border-t"
                      >
                        <th
                          scope="row"
                          className="px-3 py-2 text-left font-medium"
                        >
                          <div>{item.title}</div>
                          <div className="text-[11px] font-normal text-muted-foreground">
                            {sourceKindLabel(item.sourceKind)}
                          </div>
                        </th>
                        <td className="px-3 py-2">
                          {item.projectStageName ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(item.sourceAmount)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <TaxValue item={item} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(item.amountBeforeCoefficient)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(item.coefficient)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {formatMoney(item.amountAfterCoefficient)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function TaxValue({ item }: { item: ReviewGipCostItem }) {
  if (
    item.taxStatus === null &&
    item.taxRate === null &&
    item.taxAmount === 0
  ) {
    return "—";
  }

  return (
    <>
      <div>{formatMoney(item.taxAmount)}</div>
      <div className="text-[11px] text-muted-foreground">
        {[
          item.taxStatus,
          item.taxRate === null ? null : formatPercent(item.taxRate),
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </>
  );
}

function GroupTotals({ group }: { group: ReviewGipCostGroup }) {
  const rows = [
    ["Исходная сумма", group.sourceSubtotal],
    ["Налог", group.taxSubtotal],
    ["До коэффициента", group.subtotalBeforeCoefficient],
    ["Корректировка коэффициента", group.coefficientAdjustment],
    ["После коэффициента", group.totalAfterCoefficient],
  ] as const;

  return (
    <dl className="grid gap-2 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-5">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between gap-3 sm:block"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{formatMoney(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function groupByDepartment(items: ReviewGipCostItem[]) {
  const groups = new Map<
    string,
    { key: string; label: string; items: ReviewGipCostItem[] }
  >();

  items.forEach((item) => {
    const key = item.departmentId ?? "__without_department__";
    const current = groups.get(key);
    if (current) {
      current.items.push(item);
      return;
    }
    groups.set(key, {
      key,
      label: item.departmentName ?? "Без отдела",
      items: [item],
    });
  });

  return [...groups.values()];
}

function groupContractorItems(items: ReviewGipCostItem[]) {
  const groups = new Map<
    string,
    { key: string; label: string; items: ReviewGipCostItem[] }
  >();

  items.forEach((item) => {
    const key = item.category ?? "__without_category__";
    const current = groups.get(key);
    if (current) {
      current.items.push(item);
      return;
    }
    groups.set(key, {
      key,
      label: reviewExpenseCategoryLabel(item.category) ?? "Без категории",
      items: [item],
    });
  });

  return [...groups.values()];
}

function sourceKindLabel(sourceKind: ReviewGipCostItem["sourceKind"]): string {
  switch (sourceKind) {
    case "department_line":
      return "Строка отдела";
    case "legacy_department_labor":
      return "Исторические трудозатраты отдела";
    case "legacy_department_expense":
      return "Исторические расходы отдела";
    case "review_trip":
      return "Командировка";
    case "review_subcontractor":
      return "Подрядчик";
  }
}
