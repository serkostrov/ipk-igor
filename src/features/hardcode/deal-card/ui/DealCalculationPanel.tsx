import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import type { EntityRecord } from "@/entities/entity";
import { useDealManualEdit } from "../lib/use-deal-manual-edit";
import type { DealCardSources } from "../match";
import {
  DEAL_CALCULATION_ROWS,
  type DealCalculationContext,
  type DealCalculationRow,
  type DealCalculationSide,
} from "../model/calculation-rows";
import { DEAL_EXPENSE_CATEGORY_LABELS } from "../model/calculations";
import type { DealCardData } from "../model/deal-data";
import type { DealCardView } from "../model/deal-card-view";
import { moneyOrDash, percentOrDash } from "../model/format";
import { DealPanel } from "./shared";

const SIDES: DealCalculationSide[] = ["plan", "fact"];

export function DealCalculationPanel({
  sources,
  record,
  data,
  view,
}: {
  sources: DealCardSources;
  record: EntityRecord;
  data: DealCardData;
  view: DealCardView;
}) {
  const edit = useDealManualEdit(sources, record, data.deal.overrides);
  const context: DealCalculationContext = {
    revenueSource: view.plannedRevenue.source,
    manual: data.deal.manual,
    overrides: data.deal.overrides,
  };

  const actions = !edit.canEdit ? null : edit.editing ? (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={edit.saving}
        onClick={edit.cancel}
      >
        <X />
        Отмена
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={edit.saving}
        onClick={() => void edit.save()}
      >
        <Check />
        {edit.saving ? "Сохранение…" : "Сохранить"}
      </Button>
    </div>
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={edit.start}>
      <Pencil />
      Редактировать
    </Button>
  );

  function renderCell(row: DealCalculationRow, side: DealCalculationSide) {
    const format = row.percent ? percentOrDash : moneyOrDash;
    const column = view.profitability[side];
    const automatic = row.value(view.automatic[side]);

    if (edit.editing && edit.draft) {
      return (
        <Input
          value={edit.draft[side][row.key] ?? ""}
          onChange={(event) => edit.change(side, row.key, event.target.value)}
          placeholder={automatic == null ? "авто" : format(automatic)}
          inputMode="decimal"
          disabled={edit.saving}
          aria-label={`${row.label}: ${side === "plan" ? "план" : "факт"}`}
          className="ml-auto h-8 w-40 text-right tabular-nums"
        />
      );
    }

    const overridden = context.overrides[side][row.key] != null;
    return (
      <Tooltip>
        <TooltipTrigger
          render={<span />}
          className={cn(
            "cursor-help underline decoration-muted-foreground/40 decoration-dotted underline-offset-4",
            overridden && "text-primary",
          )}
        >
          {format(row.value(column))}
        </TooltipTrigger>
        <TooltipContent className="text-left">
          {overridden ? (
            <>
              <p>Введено вручную</p>
              <p>Автоматически: {format(automatic)}</p>
            </>
          ) : (
            row
              .explain(side, column, context)
              .map((line) => <p key={line}>{line}</p>)
          )}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <DealPanel
      title="Расчёт рентабельности"
      description="Наведите на число, чтобы увидеть, как оно получено. В режиме редактирования любое значение можно ввести вручную: остальные строки пересчитаются от него, пустая ячейка — автоматический расчёт."
      actions={actions}
    >
      <TooltipProvider delay={200}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Показатель</TableHead>
              <TableHead className="text-right">План</TableHead>
              <TableHead className="text-right">Факт</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DEAL_CALCULATION_ROWS.map((row) => (
              <TableRow key={row.key}>
                <TableCell
                  className={cn(
                    "whitespace-normal",
                    row.nested && "pl-7 text-muted-foreground",
                    row.strong && "font-semibold",
                  )}
                >
                  {row.label}
                </TableCell>
                {SIDES.map((side) => (
                  <TableCell
                    key={side}
                    className={cn(
                      "text-right tabular-nums",
                      row.strong && "font-semibold",
                    )}
                  >
                    {renderCell(row, side)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TooltipProvider>
      {view.paidExpenses.other > 0 ? (
        <p className="text-xs text-muted-foreground">
          {DEAL_EXPENSE_CATEGORY_LABELS.other} оплаченные заявки (
          {moneyOrDash(view.paidExpenses.other)}) в расчёт не входят — их статья
          не относится к расходам проекта, командировкам или подрядчикам.
        </p>
      ) : null}
    </DealPanel>
  );
}
