import { cn } from "@/shared/lib/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  DEAL_CALCULATION_RULES_HARDCODE,
  DEAL_EXPENSE_CATEGORY_LABELS,
  type DealProfitabilityColumn,
  type DealRevenueSource,
} from "../model/calculations";
import type { DealCardView } from "../model/deal-card-view";
import { moneyOrDash, percentOrDash } from "../model/format";
import { DealPanel } from "./shared";

type CalculationRow = {
  label: string;
  hint?: string;
  value: (column: DealProfitabilityColumn) => number | null;
  percent?: boolean;
  strong?: boolean;
  nested?: boolean;
};

const ROWS: CalculationRow[] = [
  {
    label: "Выручка без НДС",
    hint: "План — этапы договора (или сумма сделки), факт — акты",
    value: (column) => column.revenue,
    strong: true,
  },
  {
    label: "Трудозатраты",
    hint: "Поля сделки «Плановая / Фактическая себестоимость»",
    value: (column) => column.labor,
    nested: true,
  },
  {
    label: "Менеджер сопровождения",
    value: (column) => column.supportManager,
    nested: true,
  },
  {
    label: "Подрядчики из ТКП",
    value: (column) => column.tkpContractors,
    nested: true,
  },
  {
    label: "Расходы проекта",
    value: (column) => column.projectExpenses,
    nested: true,
  },
  { label: "Командировки", value: (column) => column.trips, nested: true },
  {
    label: "Базовая себестоимость",
    value: (column) => column.baseCost,
    strong: true,
  },
  { label: "Фикса 30%", value: (column) => column.fix },
  {
    label: "Внешние подрядчики",
    hint: "Только факт: оплаченные заявки подрядчиков",
    value: (column) => column.externalContractors,
  },
  { label: "Ретро", value: (column) => column.retro },
  {
    label: "Непредвиденные расходы",
    hint: "Только факт",
    value: (column) => column.contingency,
  },
  { label: "Налог 6%", value: (column) => column.tax },
  {
    label: "Себестоимость до бонуса",
    value: (column) => column.costBeforeBonus,
    strong: true,
  },
  {
    label: "Прибыль до бонуса",
    value: (column) => column.profitBeforeBonus,
  },
  {
    label: "Бонус сотрудникам",
    hint: "В плане всегда 0",
    value: (column) => column.bonus,
  },
  {
    label: "Итоговая себестоимость",
    value: (column) => column.finalCost,
    strong: true,
  },
  {
    label: "Итоговая прибыль",
    value: (column) => column.finalProfit,
    strong: true,
  },
  {
    label: "Рентабельность",
    hint: "Итоговая прибыль / выручка без НДС",
    value: (column) => column.profitabilityPercent,
    percent: true,
    strong: true,
  },
];

const REVENUE_SOURCE_LABELS: Record<DealRevenueSource, string> = {
  "contract-stages": "Этапы договора",
  "deal-without-vat": "Сумма сделки без НДС",
  "deal-with-vat-fallback": "Сумма сделки с НДС (fallback)",
  none: "Не заполнена",
};

export function DealCalculationPanel({ view }: { view: DealCardView }) {
  const { plan, fact } = view.profitability;
  const rules = DEAL_CALCULATION_RULES_HARDCODE;

  return (
    <div className="flex flex-col gap-4">
      <DealPanel
        title="Расчёт рентабельности"
        description={`Плановая выручка: ${REVENUE_SOURCE_LABELS[view.plannedRevenue.source]}. Фактическая выручка — сумма неотклонённых актов.`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Показатель</TableHead>
              <TableHead className="text-right">План</TableHead>
              <TableHead className="text-right">Факт</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => {
              const format = row.percent ? percentOrDash : moneyOrDash;
              return (
                <TableRow key={row.label}>
                  <TableCell
                    className={cn(
                      "whitespace-normal",
                      row.nested && "pl-7 text-muted-foreground",
                      row.strong && "font-semibold",
                    )}
                  >
                    {row.label}
                    {row.hint ? (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {row.hint}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      row.strong && "font-semibold",
                    )}
                  >
                    {format(row.value(plan))}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      row.strong && "font-semibold",
                    )}
                  >
                    {format(row.value(fact))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {view.paidExpenses.other > 0 ? (
          <p className="text-xs text-muted-foreground">
            {DEAL_EXPENSE_CATEGORY_LABELS.other} оплаченные заявки (
            {moneyOrDash(view.paidExpenses.other)}) в расчёт не входят — их
            статья не относится к расходам проекта, командировкам или
            подрядчикам.
          </p>
        ) : null}
      </DealPanel>

      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Временные правила: менеджер сопровождения{" "}
        {rules.hasSupportManager ? "включён" : "выключен"}, ретро{" "}
        {rules.retro.type === "none" ? "не начисляется" : "начисляется"}, бонус
        сотрудникам {moneyOrDash(rules.employeeBonus)}, плановые блоки ТКП не
        подтягиваются. В CRM пока нет полей для этих данных.
      </p>
    </div>
  );
}
