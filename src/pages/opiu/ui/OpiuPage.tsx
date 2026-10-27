import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { OpiuReportTable, useOpiuReport } from "@/features/hardcode";

export function OpiuPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [collapsedRows, setCollapsedRows] = useState(() => new Set<string>());
  const { report, hasActsEntity, hasDdsEntity, hasArticlesEntity } =
    useOpiuReport(year);

  function toggleCollapsed(key: string) {
    setCollapsedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const missing: string[] = [];
  if (!hasActsEntity) missing.push("Акты");
  if (!hasDdsEntity) missing.push("ДДС");
  if (!hasArticlesEntity) missing.push("Статьи ДДС");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ОПиУ</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Отчёт о прибылях и убытках
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => setYear((value) => value - 1)}
            title="Предыдущий год"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex h-8 min-w-20 items-center justify-center rounded-md border border-border bg-card px-3 text-sm font-medium">
            {year}
          </div>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => setYear((value) => value + 1)}
            title="Следующий год"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {missing.length > 0 ? (
        <p className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Не найдены сущности: {missing.join(", ")}. Соответствующие строки
          отчёта будут пустыми.
        </p>
      ) : null}

      <OpiuReportTable
        report={report}
        year={year}
        collapsedRows={collapsedRows}
        onToggleCollapsed={toggleCollapsed}
      />
    </div>
  );
}
