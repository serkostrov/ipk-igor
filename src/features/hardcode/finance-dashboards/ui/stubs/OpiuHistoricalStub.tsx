import {
  ArrowDownRight,
  BarChart3,
  CircleDollarSign,
  Percent,
  TrendingUp,
} from "lucide-react";
import { HistoricalUnavailableBanner } from "./HistoricalUnavailableBanner";
import { ChartSection, MetricCard } from "../shared";

export function OpiuHistoricalStub() {
  return (
    <div className="space-y-4">
      <HistoricalUnavailableBanner kind="opiu-historical" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Выручка без НДС" value="—" icon={CircleDollarSign} />
        <MetricCard label="Расходы" value="—" icon={ArrowDownRight} />
        <MetricCard label="Чистая прибыль" value="—" icon={TrendingUp} />
        <MetricCard label="Рентабельность" value="—" icon={Percent} />
      </div>

      <ChartSection
        title="Динамика выручки, расходов и прибыли"
        icon={<BarChart3 className="size-4 text-muted-foreground" />}
      >
        <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
          Графики исторического ОПиУ появятся после подключения BFF
        </div>
      </ChartSection>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartSection title="Выручка по юрлицам">
          <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
            Нет данных
          </div>
        </ChartSection>
        <ChartSection title="Структура расходов">
          <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
            Нет данных
          </div>
        </ChartSection>
      </div>
    </div>
  );
}
