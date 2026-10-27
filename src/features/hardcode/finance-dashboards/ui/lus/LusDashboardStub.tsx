import {
  BarChart3,
  CircleDollarSign,
  Percent,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { HistoricalUnavailableBanner } from "../stubs/HistoricalUnavailableBanner";
import { ChartSection, MetricCard } from "../shared";

type LusDashboardStubProps = {
  historical?: boolean;
  projectFilter: "all" | "won";
  onProjectFilterChange: (value: "all" | "won") => void;
};

export function LusDashboardStub({
  historical = false,
  projectFilter,
  onProjectFilterChange,
}: LusDashboardStubProps) {
  return (
    <div className="space-y-4">
      <HistoricalUnavailableBanner
        kind={historical ? "lus-historical" : "lus"}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Проекты:</span>
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={projectFilter === "all" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => onProjectFilterChange("all")}
          >
            Все
          </Button>
          <Button
            type="button"
            size="sm"
            variant={projectFilter === "won" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => onProjectFilterChange("won")}
          >
            Выигранные
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Выручка без НДС" value="—" icon={CircleDollarSign} />
        <MetricCard label="Расходы" value="—" icon={TrendingUp} />
        <MetricCard label="Прибыль" value="—" icon={BarChart3} />
        <MetricCard label="Рентабельность" value="—" icon={Percent} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartSection title="Динамика по месяцам">
          <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
            График появится после подключения источника ЛУС
          </div>
        </ChartSection>
        <ChartSection title="Проекты">
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
            <Users className="size-5 opacity-60" />
            Нет данных по проектам
          </div>
        </ChartSection>
      </div>
    </div>
  );
}
