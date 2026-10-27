import {
  formatEntityDecimalTotal,
  type EntityAggregateRow,
} from "@/entities/entity";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

function formatCashFlowExpense(value: number) {
  return formatEntityDecimalTotal(-Math.abs(value));
}

type DdsWalletSummaryTableProps = {
  rows: EntityAggregateRow[];
};

/**
 * Compact wallet cash-flow summary (opening / income / expense / closing).
 */
export function DdsWalletSummaryTable({ rows }: DdsWalletSummaryTableProps) {
  if (rows.length === 0) return null;

  const footer = rows.reduce(
    (acc, row) => {
      const cf = row.cashFlow;
      if (!cf) return acc;
      return {
        opening:
          cf.opening == null ? acc.opening : (acc.opening ?? 0) + cf.opening,
        income: acc.income + cf.income,
        expense: acc.expense + cf.expense,
        closing: acc.closing + cf.closing,
        hasOpening: acc.hasOpening || cf.opening != null,
      };
    },
    {
      opening: null as number | null,
      income: 0,
      expense: 0,
      closing: 0,
      hasOpening: false,
    },
  );

  return (
    <div className="max-h-[min(16rem,35vh)] min-h-0 overflow-auto rounded-xl border border-border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="whitespace-nowrap">Кошелёк</TableHead>
            <TableHead className="whitespace-nowrap text-right">
              Остаток на начало периода
            </TableHead>
            <TableHead className="whitespace-nowrap text-right">
              Сумма прихода
            </TableHead>
            <TableHead className="whitespace-nowrap text-right">
              Сумма расхода
            </TableHead>
            <TableHead className="whitespace-nowrap text-right">
              Остаток на конец периода
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const cf = row.cashFlow;
            const label = row.groups[0]?.label ?? "—";
            return (
              <TableRow key={row.key} className="hover:bg-transparent">
                <TableCell className="whitespace-nowrap">{label}</TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {cf?.opening == null
                    ? "—"
                    : formatEntityDecimalTotal(cf.opening)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#16a34a]">
                  {formatEntityDecimalTotal(cf?.income ?? 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-[#dc2626]">
                  {formatCashFlowExpense(cf?.expense ?? 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {formatEntityDecimalTotal(cf?.closing ?? 0)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell className="font-medium text-foreground">Итого</TableCell>
            <TableCell className="text-right font-medium tabular-nums text-foreground">
              {footer.hasOpening
                ? formatEntityDecimalTotal(footer.opening ?? 0)
                : "—"}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums text-[#16a34a]">
              {formatEntityDecimalTotal(footer.income)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums text-[#dc2626]">
              {formatCashFlowExpense(footer.expense)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums text-foreground">
              {formatEntityDecimalTotal(footer.closing)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
