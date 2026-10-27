import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/button";
import { DateRangePicker } from "@/shared/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useDdsDashboard } from "../lib/use-dds-dashboard";
import { useOpiuDashboard } from "../lib/use-opiu-dashboard";
import {
  financeDashboardQuickYears,
  financeDashboardYearRange,
  loadPersistedFinanceDashboardSearch,
  localIsoDate,
  monthEndFromIso,
  monthEndIso,
  monthStartFromIso,
  monthStartIso,
  savePersistedFinanceDashboardSearch,
} from "../model/period";
import {
  ALL_LEGAL,
  ALL_PROJECTS,
  type DashboardBalanceView,
  type FinanceDashboardTab,
} from "../model/types";
import { DdsDashboardContent } from "./dds/DdsDashboardContent";
import { LusDashboardStub } from "./lus/LusDashboardStub";
import { OpiuDashboardContent } from "./opiu/OpiuDashboardContent";
import { OpiuHistoricalStub } from "./stubs/OpiuHistoricalStub";

function initialPeriod() {
  const now = new Date();
  const persisted = loadPersistedFinanceDashboardSearch();
  return {
    dateFrom: persisted.dateFrom ?? monthStartIso(now),
    dateTo: persisted.dateTo ?? monthEndIso(now),
  };
}

export function FinanceDashboardsPage() {
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<FinanceDashboardTab>("dds");
  const [dateFrom, setDateFrom] = useState(() => initialPeriod().dateFrom);
  const [dateTo, setDateTo] = useState(
    () =>
      loadPersistedFinanceDashboardSearch().dateTo ?? monthEndIso(new Date()),
  );
  const [legalFilter, setLegalFilter] = useState(ALL_LEGAL);
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [lusProjectFilter, setLusProjectFilter] = useState<"all" | "won">(
    "all",
  );
  const [balanceView, setBalanceView] =
    useState<DashboardBalanceView>("withCredit");

  const isHistoricalOpiu = tab === "opiu-historical";
  const isPeriodValid = !!dateFrom && !!dateTo && dateFrom <= dateTo;
  const selectedLegalId = legalFilter === ALL_LEGAL ? null : legalFilter;
  const selectedProjectId =
    projectFilter === ALL_PROJECTS ? null : projectFilter;
  const quickYears = useMemo(() => financeDashboardQuickYears(now), [now]);

  useEffect(() => {
    savePersistedFinanceDashboardSearch({ dateFrom, dateTo });
  }, [dateFrom, dateTo]);

  function selectTab(next: FinanceDashboardTab) {
    setTab(next);
    if (next === "opiu-historical") {
      setDateFrom((value) => monthStartFromIso(value));
      setDateTo((value) => monthEndFromIso(value));
    }
  }

  const dds = useDdsDashboard({
    dateFrom,
    dateTo,
    selectedLegalId,
    selectedProjectId,
    balanceView,
  });

  const opiu = useOpiuDashboard({
    dateFrom,
    dateTo,
    enabled: tab === "opiu" && isPeriodValid,
  });

  const ddsMissing: string[] = [];
  if (!dds.hasDdsEntity) ddsMissing.push("ДДС");
  if (!dds.hasArticlesEntity) ddsMissing.push("Статьи ДДС");
  if (!dds.hasWalletsEntity) ddsMissing.push("Кошельки");

  const opiuMissing: string[] = [];
  if (!opiu.hasActsEntity) opiuMissing.push("Акты");
  if (!opiu.hasDdsEntity) opiuMissing.push("ДДС");
  if (!opiu.hasArticlesEntity) opiuMissing.push("Статьи ДДС");

  const periodValue = { start: dateFrom, end: dateTo };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Дашборды</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Финансовый отдел · {localIsoDate()}
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (
            value === "dds" ||
            value === "lus" ||
            value === "lus-historical" ||
            value === "opiu" ||
            value === "opiu-historical"
          ) {
            selectTab(value);
          }
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
      >
        <div className="flex shrink-0 flex-wrap items-end gap-3">
          <TabsList className="h-9">
            <TabsTrigger value="dds" className="text-xs">
              ДДС
            </TabsTrigger>
            <TabsTrigger value="lus" className="text-xs">
              ЛУС
            </TabsTrigger>
            <TabsTrigger value="lus-historical" className="text-xs">
              ЛУС (ист.)
            </TabsTrigger>
            <TabsTrigger value="opiu" className="text-xs">
              ОПиУ
            </TabsTrigger>
            <TabsTrigger value="opiu-historical" className="text-xs">
              ОПиУ (ист.)
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-end gap-2">
            {isHistoricalOpiu || tab === "opiu" ? (
              <>
                <MonthInput
                  label="Начальный месяц"
                  value={dateFrom}
                  onChange={(value) => setDateFrom(monthStartFromIso(value))}
                />
                <MonthInput
                  label="Конечный месяц"
                  value={dateTo}
                  onChange={(value) => setDateTo(monthEndFromIso(value))}
                />
                {tab === "opiu" ? (
                  <div className="grid gap-1">
                    <span className="text-[11px] text-muted-foreground">
                      Год
                    </span>
                    <div className="flex h-9 items-center gap-1 rounded-md border border-border bg-muted/20 p-1">
                      {quickYears.map((year) => {
                        const range = financeDashboardYearRange(year);
                        const active =
                          dateFrom === range.dateFrom &&
                          dateTo === range.dateTo;
                        return (
                          <Button
                            key={year}
                            type="button"
                            variant={active ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setDateFrom(range.dateFrom);
                              setDateTo(range.dateTo);
                            }}
                          >
                            {year}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="grid gap-1">
                <span className="text-[11px] text-muted-foreground">
                  Период
                </span>
                <DateRangePicker
                  value={periodValue}
                  onChange={(next) => {
                    if (!next) return;
                    setDateFrom(next.start);
                    setDateTo(next.end);
                  }}
                  aria-label="Период дашборда"
                  className="h-9 w-[240px]"
                />
              </div>
            )}

            {tab === "dds" ? (
              <>
                <FilterSelect
                  label="Юрлицо"
                  value={legalFilter}
                  allValue={ALL_LEGAL}
                  allLabel="Все юрлица"
                  options={dds.legalEntities}
                  onChange={setLegalFilter}
                />
                {dds.projects.length > 0 ? (
                  <FilterSelect
                    label="Проект"
                    value={projectFilter}
                    allValue={ALL_PROJECTS}
                    allLabel="Все проекты"
                    options={dds.projects}
                    onChange={setProjectFilter}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto pr-1">
          <TabsContent value="dds" className="mt-0">
            <DdsDashboardContent
              data={dds.data}
              balanceView={balanceView}
              onBalanceViewChange={setBalanceView}
              isPeriodValid={isPeriodValid}
              missingEntities={ddsMissing}
            />
          </TabsContent>
          <TabsContent value="lus" className="mt-0">
            <LusDashboardStub
              projectFilter={lusProjectFilter}
              onProjectFilterChange={setLusProjectFilter}
            />
          </TabsContent>
          <TabsContent value="lus-historical" className="mt-0">
            <LusDashboardStub
              historical
              projectFilter={lusProjectFilter}
              onProjectFilterChange={setLusProjectFilter}
            />
          </TabsContent>
          <TabsContent value="opiu" className="mt-0">
            <OpiuDashboardContent
              report={opiu.report}
              monthly={opiu.monthly}
              profitComparison={opiu.profitComparison}
              expenseBlocks={opiu.expenseBlocks}
              isPeriodValid={isPeriodValid}
              missingEntities={opiuMissing}
            />
          </TabsContent>
          <TabsContent value="opiu-historical" className="mt-0">
            <OpiuHistoricalStub />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function MonthInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[11px] text-muted-foreground">
      {label}
      <input
        type="month"
        value={value.slice(0, 7)}
        onChange={(event) => {
          if (event.target.value) onChange(`${event.target.value}-01`);
        }}
        className="h-9 w-[150px] rounded-md border border-border bg-background px-2 text-xs text-foreground"
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  allValue,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allValue: string;
  allLabel: string;
  options: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
}) {
  const selected =
    value === allValue
      ? allLabel
      : (options.find((option) => option.id === value)?.name ?? allLabel);

  return (
    <div className="grid gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next == null) return;
          onChange(String(next));
        }}
      >
        <SelectTrigger className="h-9 w-[180px]" aria-label={label}>
          <SelectValue>
            <span className="truncate">{selected}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allValue}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
