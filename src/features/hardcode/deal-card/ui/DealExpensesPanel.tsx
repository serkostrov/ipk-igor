import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  DEAL_EXPENSE_CATEGORY_LABELS,
  sumPresent,
  type DealExpenseCategory,
} from "../model/calculations";
import type { DealCardData } from "../model/deal-data";
import type { DealCardView } from "../model/deal-card-view";
import { dateOrDash, moneyOrDash } from "../model/format";
import type { DealCardSources } from "../match";
import {
  DealEmptyState,
  DealPanel,
  DealRecordLink,
  DealStatusBadge,
} from "./shared";

const CATEGORY_ORDER: DealExpenseCategory[] = [
  "project",
  "trips",
  "contractors",
  "contingency",
  "other",
];

export function DealExpensesPanel({
  sources,
  data,
  view,
  onOpenRelation,
}: {
  sources: DealCardSources;
  data: DealCardData;
  view: DealCardView;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  const paidTotal = sumPresent(
    CATEGORY_ORDER.map((category) => view.paidExpenses[category]),
  );

  return (
    <div className="flex flex-col gap-4">
      <DealPanel
        title="Оплачено по категориям (без НДС)"
        description="Только заявки в стадии «Оплачено». Категория определяется по статье затрат."
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

      <DealPanel
        title="Заявки на оплату"
        description="Заявки, привязанные к договору, этапам или проектам сделки."
      >
        {data.requests.length === 0 ? (
          <DealEmptyState>Заявок по сделке пока нет.</DealEmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Заявка</TableHead>
                <TableHead>Статья</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead>Стадия</TableHead>
                <TableHead>Дата платежа</TableHead>
                <TableHead className="text-right">Без НДС</TableHead>
                <TableHead className="text-right">С НДС</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <DealRecordLink
                      entityId={sources.request?.id}
                      recordId={request.id}
                      title={request.title}
                      onOpenRelation={onOpenRelation}
                    />
                  </TableCell>
                  <TableCell>{request.articleName || "—"}</TableCell>
                  <TableCell>
                    {DEAL_EXPENSE_CATEGORY_LABELS[request.category]}
                  </TableCell>
                  <TableCell>
                    {request.status ? (
                      <DealStatusBadge
                        tone={request.paid ? "success" : "neutral"}
                      >
                        {request.status}
                      </DealStatusBadge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{dateOrDash(request.desiredDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyOrDash(request.amountWithoutVat)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moneyOrDash(request.amountWithVat)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="font-medium">
                  Всего заявок
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {moneyOrDash(
                    sumPresent(
                      data.requests.map((item) => item.amountWithoutVat),
                    ),
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {moneyOrDash(
                    sumPresent(data.requests.map((item) => item.amountWithVat)),
                  )}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </DealPanel>
    </div>
  );
}
