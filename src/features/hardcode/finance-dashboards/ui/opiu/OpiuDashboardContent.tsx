import type { ReactNode } from "react";
import {
  ArrowDownRight,
  BarChart3,
  Building2,
  CircleDollarSign,
  GitBranch,
  Percent,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getProfitLossRow,
  profitLossPercentValue,
  sumProfitLossValues,
} from "../../../opiu/model/calculation";
import type {
  ProfitLossBreakdownItem,
  ProfitLossReport,
} from "../../../opiu/model/types";
import {
  formatBarLabelValue,
  formatCompactMoney,
  formatMoney,
  formatPercent,
} from "../../lib/format";
import type { OpiuExpenseBlock } from "../../lib/use-opiu-dashboard";
import type {
  OpiuMonthlyChartData,
  OpiuProfitComparisonPoint,
} from "../../model/opiu-dashboard-data";
import { FinanceChartFrame } from "../FinanceChartFrame";
import { ChartSection, DashboardState, MetricCard } from "../shared";

type OpiuDashboardContentProps = {
  report: ProfitLossReport;
  monthly: OpiuMonthlyChartData[];
  profitComparison: OpiuProfitComparisonPoint[];
  expenseBlocks: OpiuExpenseBlock[];
  isPeriodValid: boolean;
  missingEntities: string[];
};

export function OpiuDashboardContent({
  report,
  monthly,
  profitComparison,
  expenseBlocks,
  isPeriodValid,
  missingEntities,
}: OpiuDashboardContentProps) {
  if (!isPeriodValid) {
    return (
      <DashboardState tone="error">
        Дата начала должна быть не позже даты окончания.
      </DashboardState>
    );
  }

  const netRow = getProfitLossRow(report, "net-profit");
  const netProfit = netRow
    ? (netRow.total ?? sumProfitLossValues(netRow.values))
    : 0;
  const profitability = profitLossPercentValue(netProfit, report.revenueTotal);
  const hasData =
    report.revenueTotal !== 0 || report.totalExpenses !== 0 || netProfit !== 0;

  return (
    <div className="space-y-4">
      {missingEntities.length > 0 ? (
        <DashboardState>
          Не найдены сущности: {missingEntities.join(", ")}. Соответствующие
          строки отчёта будут пустыми.
        </DashboardState>
      ) : null}
      {!hasData ? (
        <DashboardState>Данных ОПиУ за выбранный период нет.</DashboardState>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Выручка без НДС"
          value={formatMoney(report.revenueTotal)}
          icon={CircleDollarSign}
          tone="good"
        />
        <MetricCard
          label="Расходы"
          value={formatMoney(report.totalExpenses)}
          icon={ArrowDownRight}
          tone={report.totalExpenses > 0 ? "bad" : "neutral"}
        />
        <MetricCard
          label="Чистая прибыль"
          value={formatMoney(netProfit)}
          icon={TrendingUp}
          tone={netProfit < 0 ? "bad" : "good"}
        />
        <MetricCard
          label="Рентабельность"
          value={formatPercent(profitability)}
          icon={Percent}
          tone={netProfit < 0 ? "bad" : "neutral"}
        />
      </div>

      <ChartSection
        title="Динамика выручки, расходов и прибыли"
        icon={<BarChart3 className="size-4 text-muted-foreground" />}
      >
        <FinanceChartFrame className="h-[300px]">
          {(size) => (
            <ComposedChart
              width={size.width}
              height={size.height}
              data={monthly}
              margin={{ top: 28, right: 12, bottom: 4, left: 8 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <YAxis
                tickFormatter={formatCompactMoney}
                tickLine={false}
                axisLine={false}
                width={60}
                fontSize={12}
              />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Bar
                dataKey="revenue"
                name="Выручка"
                fill="#16a34a"
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="revenue"
                  position="top"
                  offset={8}
                  fontSize={10}
                  formatter={formatBarLabelValue}
                />
              </Bar>
              <Bar
                dataKey="expenses"
                name="Расходы"
                fill="#dc2626"
                radius={[4, 4, 0, 0]}
              />
              <Line
                type="monotone"
                dataKey="netProfit"
                name="Чистая прибыль"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 3, fill: "#2563eb" }}
              />
            </ComposedChart>
          )}
        </FinanceChartFrame>
      </ChartSection>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakdownBarCard
          title="Выручка по юрлицам"
          icon={<Building2 className="size-4 text-muted-foreground" />}
          items={report.revenueByLegalEntity}
          emptyLabel="Нет выручки по юрлицам за выбранный период."
        />
        <BreakdownBarCard
          title="Выручка по направлениям сделок"
          icon={<GitBranch className="size-4 text-muted-foreground" />}
          items={report.revenueByDirection}
          emptyLabel="Нет выручки по направлениям за выбранный период."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ExpenseStructureCard blocks={expenseBlocks} />
        <ExpenseDetailsCard blocks={expenseBlocks} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartSection
          title="Точка безубыточности относительно выручки"
          icon={<Percent className="size-4 text-muted-foreground" />}
        >
          <FinanceChartFrame className="h-[280px]">
            {(size) => (
              <ComposedChart
                width={size.width}
                height={size.height}
                data={monthly}
                margin={{ top: 28, right: 12, bottom: 4, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={formatCompactMoney}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  fontSize={12}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Bar
                  dataKey="revenue"
                  name="Выручка"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="breakEven"
                  name="Точка безубыточности"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  dot={{ r: 3, fill: "#7c3aed" }}
                />
              </ComposedChart>
            )}
          </FinanceChartFrame>
        </ChartSection>

        <ChartSection
          title="Сравнение прибылей"
          icon={<TrendingUp className="size-4 text-muted-foreground" />}
        >
          <FinanceChartFrame className="h-[280px]">
            {(size) => (
              <LineChart
                width={size.width}
                height={size.height}
                data={profitComparison}
                margin={{ top: 28, right: 8, bottom: 4, left: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={formatCompactMoney}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  fontSize={12}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Line
                  type="monotone"
                  dataKey="marginalProfit"
                  name="Маржинальная прибыль"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#2563eb" }}
                />
                <Line
                  type="monotone"
                  dataKey="grossProfit"
                  name="Валовая прибыль"
                  stroke="#16a34a"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#16a34a" }}
                />
                <Line
                  type="monotone"
                  dataKey="operatingProfit"
                  name="Операционная прибыль"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#f97316" }}
                />
                <Line
                  type="monotone"
                  dataKey="netProfit"
                  name="Чистая прибыль"
                  stroke="#7c3aed"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#7c3aed" }}
                />
              </LineChart>
            )}
          </FinanceChartFrame>
        </ChartSection>
      </div>
    </div>
  );
}

function BreakdownBarCard({
  title,
  icon,
  items,
  emptyLabel,
}: {
  title: string;
  icon: ReactNode;
  items: ProfitLossBreakdownItem[];
  emptyLabel: string;
}) {
  const data = items.slice(0, 10);
  return (
    <ChartSection title={title} icon={icon}>
      {data.length === 0 ? (
        <DashboardState>{emptyLabel}</DashboardState>
      ) : (
        <FinanceChartFrame className="h-[260px]">
          {(size) => (
            <BarChart
              width={size.width}
              height={size.height}
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 4, left: 8 }}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={formatCompactMoney}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Bar dataKey="amount" fill="#16a34a" radius={[0, 4, 4, 0]}>
                <LabelList
                  dataKey="amount"
                  position="right"
                  fontSize={10}
                  formatter={formatBarLabelValue}
                />
              </Bar>
            </BarChart>
          )}
        </FinanceChartFrame>
      )}
    </ChartSection>
  );
}

function ExpenseStructureCard({ blocks }: { blocks: OpiuExpenseBlock[] }) {
  return (
    <ChartSection
      title="Структура расходов"
      icon={<PieChartIcon className="size-4 text-muted-foreground" />}
    >
      {blocks.length === 0 ? (
        <DashboardState>Нет расходов за выбранный период.</DashboardState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
          <FinanceChartFrame className="mx-auto h-[160px] w-[160px]">
            {(size) => (
              <PieChart width={size.width} height={size.height}>
                <Pie
                  data={blocks}
                  dataKey="amount"
                  nameKey="title"
                  innerRadius={38}
                  outerRadius={68}
                  paddingAngle={2}
                >
                  {blocks.map((block) => (
                    <Cell key={block.key} fill={block.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
              </PieChart>
            )}
          </FinanceChartFrame>
          <ul className="space-y-1.5 text-sm">
            {blocks.map((block) => (
              <li
                key={block.key}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: block.color }}
                  />
                  <span className="truncate">{block.title}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatPercent(block.totalExpensePercent)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartSection>
  );
}

function ExpenseDetailsCard({ blocks }: { blocks: OpiuExpenseBlock[] }) {
  const details = blocks.flatMap((block) =>
    block.details.map((detail) => ({
      ...detail,
      blockTitle: block.title,
      color: block.color,
    })),
  );
  return (
    <ChartSection title="Детализация расходов">
      {details.length === 0 ? (
        <DashboardState>Нет детализации расходов.</DashboardState>
      ) : (
        <ul className="max-h-[280px] space-y-2 overflow-auto text-sm">
          {details.slice(0, 24).map((detail) => (
            <li
              key={`${detail.blockTitle}:${detail.key}`}
              className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{detail.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {detail.blockTitle} · {formatPercent(detail.revenuePercent)}{" "}
                  от выручки
                </p>
              </div>
              <span className="shrink-0 tabular-nums">
                {formatMoney(detail.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartSection>
  );
}
