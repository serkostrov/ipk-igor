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
} from "../model/calculations";
import type { DealCardData } from "../model/deal-data";
import { dateOrDash, moneyOrDash } from "../model/format";
import type { DealCardSources } from "../match";
import {
  DealEmptyState,
  DealPanel,
  DealRecordLink,
  DealStatusBadge,
} from "./shared";

/** Fallback list while the deal has no configured «Заявки на оплату» tab. */
export function DealRequestsPanel({
  sources,
  data,
  onOpenRelation,
}: {
  sources: DealCardSources;
  data: DealCardData;
  onOpenRelation?: (entityId: string, recordId: string) => void;
}) {
  return (
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
  );
}
