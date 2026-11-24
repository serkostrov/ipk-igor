import {
  DEAL_EXPENSE_CATEGORY_LABELS,
  sumPresent,
  type DealExpenseCategory,
} from "../model/calculations";
import type { DealCardView } from "../model/deal-card-view";
import { moneyOrDash } from "../model/format";
import { DealPanel } from "./shared";

const CATEGORY_ORDER: DealExpenseCategory[] = [
  "project",
  "trips",
  "contractors",
  "contingency",
  "other",
];

export function DealExpenseCategoriesPanel({ view }: { view: DealCardView }) {
  const paidTotal = sumPresent(
    CATEGORY_ORDER.map((category) => view.paidExpenses[category]),
  );

  return (
    <DealPanel
      title="Оплачено по категориям (без НДС)"
      description="Заявки на оплату сделки в стадии «Оплачено». Категория определяется по статье затрат."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {CATEGORY_ORDER.map((category) => (
          <div
            key={category}
            className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2"
          >
            <p className="text-[11px] text-muted-foreground">
              {DEAL_EXPENSE_CATEGORY_LABELS[category]}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {moneyOrDash(view.paidExpenses[category])}
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-border bg-background px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Всего</p>
          <p className="text-sm font-semibold tabular-nums">
            {moneyOrDash(paidTotal)}
          </p>
        </div>
      </div>
    </DealPanel>
  );
}
