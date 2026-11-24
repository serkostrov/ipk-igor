import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { sumPresent } from "../model/calculations";
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

export function DealActsPanel({
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
  const stageTitles = new Map(
    data.stages.map((stage) => [stage.id, stage.title]),
  );
  const contractWithVat =
    view.financials.source === "contract" ? view.financials.withVat : null;
  const remaining =
    contractWithVat == null
      ? null
      : sumPresent([contractWithVat, -(view.actsWithVat ?? 0)]);

  return (
    <DealPanel
      title="Акты выполненных работ"
      description="Акты договоров сделки. Отклонённые акты не входят в итоги и в фактическую выручку."
    >
      {data.contracts.length === 0 ? (
        <DealEmptyState>
          К сделке не привязан договор — акты появятся после его создания на
          вкладке «Договор».
        </DealEmptyState>
      ) : data.acts.length === 0 ? (
        <DealEmptyState>По договорам сделки актов пока нет.</DealEmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Акт</TableHead>
              <TableHead>Номер</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Этап</TableHead>
              <TableHead>Стадия</TableHead>
              <TableHead className="text-right">Без НДС</TableHead>
              <TableHead className="text-right">С НДС</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.acts.map((act) => (
              <TableRow
                key={act.id}
                className={act.rejected ? "opacity-60" : undefined}
              >
                <TableCell>
                  <DealRecordLink
                    entityId={sources.act?.id}
                    recordId={act.id}
                    title={act.title}
                    onOpenRelation={onOpenRelation}
                  />
                </TableCell>
                <TableCell>{act.number || "—"}</TableCell>
                <TableCell>{dateOrDash(act.date)}</TableCell>
                <TableCell>
                  {(act.stageId && stageTitles.get(act.stageId)) || "—"}
                </TableCell>
                <TableCell>
                  {act.status ? (
                    <DealStatusBadge tone={act.rejected ? "danger" : "neutral"}>
                      {act.status}
                    </DealStatusBadge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {moneyOrDash(act.amountWithoutVat)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {moneyOrDash(act.amountWithVat)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="font-medium">
                Итого по актам
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {moneyOrDash(view.actsWithoutVat)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {moneyOrDash(view.actsWithVat)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                Остаток к закрытию по договору (с НДС)
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {moneyOrDash(remaining)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </DealPanel>
  );
}
