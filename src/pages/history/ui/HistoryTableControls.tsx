import { Button } from "@/shared/ui/button";
import { TableCell, TableHead, TableRow } from "@/shared/ui/table";
import type { EntityRecordEventsStatus } from "@/entities/history";

export function HistoryColumn({ children }: { children: string }) {
  return (
    <TableHead className="h-9 border-b border-border bg-foreground/[0.045] px-3 text-[11px] font-semibold tracking-wide text-foreground/65 uppercase">
      {children}
    </TableHead>
  );
}

export function HistoryStatusRow({
  status,
  error,
  colSpan,
}: {
  status: EntityRecordEventsStatus;
  error: string | null;
  colSpan: number;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className={
          status === "error"
            ? "py-10 text-center text-destructive"
            : "py-10 text-center text-muted-foreground"
        }
      >
        {status === "loading"
          ? "Загрузка…"
          : status === "error"
            ? `Не удалось загрузить историю: ${error}`
            : "Изменений за период нет"}
      </TableCell>
    </TableRow>
  );
}

export function HistoryLoadMore({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-center border-t border-border p-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={onClick}
      >
        {loading ? "Загрузка…" : "Показать ещё"}
      </Button>
    </div>
  );
}
