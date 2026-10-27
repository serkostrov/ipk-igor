import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Landmark,
  LineChart as LineChartIcon,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/shared/ui/button";
import {
  formatBarLabelValue,
  formatCompactMoney,
  formatMoney,
  formatPercent,
} from "../../lib/format";
import { sampleCashGapPointsForChart } from "../../model/dds-calculations";
import type {
  DashboardBalanceView,
  FinanceDashboardData,
} from "../../model/types";
import { FinanceChartFrame } from "../FinanceChartFrame";
import { ChartSection, DashboardState, MetricCard } from "../shared";

type DdsDashboardContentProps = {
  data: FinanceDashboardData;
  balanceView: DashboardBalanceView;
  onBalanceViewChange: (view: DashboardBalanceView) => void;
  isPeriodValid: boolean;
  missingEntities: string[];
};

export function DdsDashboardContent({
  data,
  balanceView,
  onBalanceViewChange,
  isPeriodValid,
  missingEntities,
}: DdsDashboardContentProps) {
  if (!isPeriodValid) {
    return (
      <DashboardState tone="error">
        Дата начала должна быть не позже даты окончания.
      </DashboardState>
    );
  }

  const cashGap = sampleCashGapPointsForChart(data.dailyCashGap);
  const hasFlow =
    data.totals.receipts !== 0 ||
    data.totals.outflows !== 0 ||
    data.totals.netFlow !== 0;

  return (
    <div className="space-y-4">
      {missingEntities.length > 0 ? (
        <DashboardState>
          Не найдены сущности: {missingEntities.join(", ")}. Соответствующие
          блоки могут быть пустыми.
        </DashboardState>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Баланс:</span>
        <div className="flex rounded-md border border-border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={balanceView === "own" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => onBalanceViewChange("own")}
          >
            Свои средства
          </Button>
          <Button
            type="button"
            size="sm"
            variant={balanceView === "withCredit" ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => onBalanceViewChange("withCredit")}
          >
            С учётом кредита
          </Button>
        </div>
      </div>

      {!hasFlow ? (
        <DashboardState>Данных ДДС за выбранный период нет.</DashboardState>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Остаток на начало"
          value={formatMoney(data.totals.beginBalance)}
          icon={WalletCards}
        />
        <MetricCard
          label="Приход"
          value={formatMoney(data.totals.receipts)}
          icon={ArrowUpRight}
          tone="good"
          hint={
            data.totals.clientReceipts
              ? `Клиенты: ${formatMoney(data.totals.clientReceipts)}`
              : undefined
          }
        />
        <MetricCard
          label="Расход"
          value={formatMoney(data.totals.outflows)}
          icon={ArrowDownRight}
          tone={data.totals.outflows > 0 ? "bad" : "neutral"}
        />
        <MetricCard
          label="Чистый поток"
          value={formatMoney(data.totals.netFlow)}
          icon={TrendingUp}
          tone={data.totals.netFlow < 0 ? "bad" : "good"}
        />
        <MetricCard
          label="Остаток на конец"
          value={formatMoney(data.totals.endBalance)}
          icon={Landmark}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Лимит овердрафта"
          value={formatMoney(data.credit.overdraftLimit)}
          icon={CreditCard}
        />
        <MetricCard
          label="Использовано овердрафта"
          value={formatMoney(data.credit.overdraftUsed)}
          icon={CreditCard}
          tone={data.credit.overdraftUsed > 0 ? "bad" : "neutral"}
        />
        <MetricCard
          label="Лимит факторинга"
          value={formatMoney(data.credit.factoringLimit)}
          icon={CreditCard}
        />
        <MetricCard
          label="Использовано факторинга"
          value={formatMoney(data.credit.factoringUsed)}
          icon={CreditCard}
          tone={data.credit.factoringUsed > 0 ? "bad" : "neutral"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartSection title="Приход и расход за период">
          <FinanceChartFrame className="h-[260px]">
            {(size) => (
              <BarChart
                width={size.width}
                height={size.height}
                data={data.periodBars}
                margin={{ top: 24, right: 8, bottom: 4, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={formatCompactMoney}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  fontSize={12}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {data.periodBars.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                  <LabelList
                    dataKey="amount"
                    position="top"
                    offset={6}
                    fontSize={10}
                    formatter={formatBarLabelValue}
                  />
                </Bar>
              </BarChart>
            )}
          </FinanceChartFrame>
        </ChartSection>

        <ChartSection title="По месяцам">
          <FinanceChartFrame className="h-[260px]">
            {(size) => (
              <BarChart
                width={size.width}
                height={size.height}
                data={data.monthly}
                margin={{ top: 24, right: 8, bottom: 4, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={formatCompactMoney}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  fontSize={12}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar
                  dataKey="receipts"
                  name="Приход"
                  fill="#16a34a"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="outflows"
                  name="Расход"
                  fill="#dc2626"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            )}
          </FinanceChartFrame>
        </ChartSection>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <StructurePie
          title="Структура прихода"
          items={data.receiptsStructure}
          empty="Нет приходов за период."
        />
        <StructurePie
          title="Структура расхода"
          items={data.outflowsStructure}
          empty="Нет расходов за период."
        />
      </div>

      <ChartSection
        title="Кассовый разрыв"
        icon={<LineChartIcon className="size-4 text-muted-foreground" />}
      >
        {cashGap.length === 0 ? (
          <DashboardState>Нет точек для кассового разрыва.</DashboardState>
        ) : (
          <FinanceChartFrame className="h-[280px]">
            {(size) => (
              <LineChart
                width={size.width}
                height={size.height}
                data={cashGap}
                margin={{ top: 12, right: 12, bottom: 4, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={10}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={formatCompactMoney}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  fontSize={12}
                />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value))}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as
                      { date?: string; source?: string } | undefined;
                    return point?.date
                      ? `${point.date} (${point.source ?? "Факт"})`
                      : "";
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Line
                  type="monotone"
                  dataKey="balance"
                  name="Остаток"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            )}
          </FinanceChartFrame>
        )}
      </ChartSection>

      <ChartSection title="Прогноз поступлений">
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard
            label="Факт"
            value={formatMoney(data.forecast.factTotal)}
            icon={ArrowUpRight}
            tone="good"
          />
          <MetricCard
            label="План"
            value={formatMoney(data.forecast.planTotal)}
            icon={TrendingUp}
          />
          <MetricCard
            label="Итого"
            value={formatMoney(data.forecast.total)}
            icon={WalletCards}
          />
        </div>
        {data.forecast.monthly.every((m) => m.amount === 0) ? (
          <DashboardState>
            Нет данных для прогноза поступлений (плановые сущности не найдены
            или пусты).
          </DashboardState>
        ) : (
          <FinanceChartFrame className="h-[240px]">
            {(size) => (
              <BarChart
                width={size.width}
                height={size.height}
                data={data.forecast.monthly}
                margin={{ top: 20, right: 8, bottom: 4, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={formatCompactMoney}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  fontSize={12}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar
                  dataKey="factAmount"
                  name="Факт"
                  fill="#16a34a"
                  stackId="a"
                />
                <Bar
                  dataKey="planAmount"
                  name="План"
                  fill="#94a3b8"
                  stackId="a"
                />
              </BarChart>
            )}
          </FinanceChartFrame>
        )}
      </ChartSection>
    </div>
  );
}

function StructurePie({
  title,
  items,
  empty,
}: {
  title: string;
  items: FinanceDashboardData["receiptsStructure"];
  empty: string;
}) {
  return (
    <ChartSection title={title}>
      {items.length === 0 ? (
        <DashboardState>{empty}</DashboardState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <FinanceChartFrame className="mx-auto h-[180px] w-[180px]">
            {(size) => (
              <PieChart width={size.width} height={size.height}>
                <Pie
                  data={items}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {items.map((item) => (
                    <Cell key={item.id} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
              </PieChart>
            )}
          </FinanceChartFrame>
          <ul className="max-h-[200px] space-y-1.5 overflow-auto text-sm">
            {items.slice(0, 8).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPercent(item.percent)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartSection>
  );
}
