import { useMemo, useState } from "react";
import { ChartGantt, Table2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import { Loader } from "@/shared/ui/loader";
import { TablePagination } from "@/shared/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  DEFAULT_ENTITY_TABLE_PAGE_SIZE,
  ENTITY_TABLE_PAGE_SIZES,
  ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY,
  isEntityTablePageSize,
  parseEntityTablePageSize,
} from "@/entities/entity";
import { DealEmptyState } from "../../deal-card/ui/shared";
import { usePaymentCalendar } from "../lib/use-payment-calendar";
import { listMissingPaymentCalendarSources } from "../match";
import {
  countByStatus,
  EMPTY_PAYMENT_FILTERS,
  filterPaymentRows,
  filterUnallocated,
  summarizePayments,
} from "../model/filters";
import { GRAPH_SCALES, parseGraphScale, type GraphScale } from "../model/graph";
import type {
  PaymentCalendarFilters,
  PaymentCalendarSection,
  RecordRef,
} from "../model/types";
import { PaymentFilterBar } from "./PaymentFilterBar";
import { PaymentGraph } from "./PaymentGraph";
import { PaymentTable } from "./PaymentTable";
import { UnallocatedTable } from "./UnallocatedTable";
import type { OpenRecord } from "./types";

type CalendarView = "table" | "graph";

const VIEW_OPTIONS = [
  { value: "table", label: "Таблица", Icon: Table2 },
  { value: "graph", label: "График", Icon: ChartGantt },
] as const;

function uniqueRefs(refs: Array<RecordRef | null>): RecordRef[] {
  const byId = new Map<string, RecordRef>();
  for (const ref of refs) if (ref) byId.set(ref.id, ref);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** Day / week / month / year switch, same as the DDS graph. */
function ScaleTabs({
  value,
  onChange,
}: {
  value: GraphScale;
  onChange: (value: GraphScale) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const parsed = parseGraphScale(next);
        if (parsed) onChange(parsed);
      }}
      className={cn("gap-0")}
    >
      <TabsList variant="line" className="!h-auto gap-3 bg-transparent p-0">
        {GRAPH_SCALES.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            className="h-5 rounded-none px-0 py-0 text-[11px] leading-5 font-normal text-muted-foreground shadow-none after:bottom-0 data-active:bg-transparent data-active:text-foreground data-active:shadow-none"
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function PaymentCalendarPage({
  onOpenRecord,
}: {
  onOpenRecord?: OpenRecord;
}) {
  const { sources, ready, calendar } = usePaymentCalendar();
  const [view, setView] = useState<CalendarView>("table");
  const [scale, setScale] = useState<GraphScale>("month");
  const [filters, setFilters] = useState<PaymentCalendarFilters>(
    EMPTY_PAYMENT_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorageState(
    ENTITY_TABLE_PAGE_SIZE_STORAGE_KEY,
    parseEntityTablePageSize,
    DEFAULT_ENTITY_TABLE_PAGE_SIZE,
  );

  const rows = useMemo(() => calendar?.rows ?? [], [calendar]);
  const unallocated = useMemo(() => calendar?.unallocated ?? [], [calendar]);

  const filteredRows = useMemo(
    () => filterPaymentRows(rows, filters),
    [rows, filters],
  );
  const filteredUnallocated = useMemo(
    () => filterUnallocated(unallocated, filters),
    [unallocated, filters],
  );
  const totals = useMemo(() => {
    const sums = summarizePayments(filteredRows, []);
    return {
      planned: sums.planned,
      received: sums.received,
      remaining: sums.expected + sums.overdue,
    };
  }, [filteredRows]);
  const sectionCounts = useMemo(
    (): Record<PaymentCalendarSection, number> => ({
      ...countByStatus(rows, filters),
      unallocated: filteredUnallocated.length,
    }),
    [rows, filters, filteredUnallocated],
  );

  const legalOptions = useMemo(
    () => uniqueRefs(rows.map((row) => row.stage.legal)),
    [rows],
  );
  const counterpartyOptions = useMemo(
    () => uniqueRefs(rows.map((row) => row.stage.counterparty)),
    [rows],
  );

  const showUnallocated = filters.section === "unallocated";
  const total = showUnallocated
    ? filteredUnallocated.length
    : filteredRows.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const pageStart = (currentPage - 1) * pageSize;

  const patchFilters = (patch: Partial<PaymentCalendarFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const missing = listMissingPaymentCalendarSources(sources);
  const isGraph = view === "graph";
  const tableProps =
    ready && calendar && sources
      ? {
          receiptsById: calendar.receiptsById,
          stageEntityId: sources.stage?.id,
          ddsEntityId: sources.dds?.id,
          onOpenRecord,
        }
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-8">
      <Tabs
        value={view}
        onValueChange={(next) => setView(next as CalendarView)}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <div className="flex shrink-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              Платёжный календарь
            </h1>
            <TabsList className="!h-8 gap-0.5 p-0.5">
              {VIEW_OPTIONS.map(({ value, label, Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-full flex-none gap-1 px-2.5 text-xs font-medium"
                >
                  <Icon className="size-3 opacity-70" aria-hidden />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
              План по этапам договоров и фактические поступления из ДДС
            </p>
            {isGraph ? <ScaleTabs value={scale} onChange={setScale} /> : null}
          </div>
        </div>

        {missing.length > 0 ? (
          <DealEmptyState>
            Для календаря не хватает сущностей: {missing.join(", ")}.
          </DealEmptyState>
        ) : !tableProps ? (
          <Loader block label="Загрузка…" />
        ) : (
          <>
            <div className="shrink-0">
              <PaymentFilterBar
                filters={filters}
                legalOptions={legalOptions}
                counterpartyOptions={counterpartyOptions}
                sectionCounts={sectionCounts}
                onChange={patchFilters}
                onReset={() => patchFilters(EMPTY_PAYMENT_FILTERS)}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
              {isGraph ? (
                <PaymentGraph
                  rows={filteredRows}
                  receiptsById={tableProps.receiptsById}
                  unallocated={filteredUnallocated}
                  scale={scale}
                  stageEntityId={tableProps.stageEntityId}
                  onOpenRecord={onOpenRecord}
                />
              ) : (
                <>
                  <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                    {total === 0 ? (
                      <div className="p-4">
                        <DealEmptyState>
                          {showUnallocated
                            ? "Нет нераспределённых поступлений."
                            : "Нет плановых платежей. План строится по этапам договоров с суммой."}
                        </DealEmptyState>
                      </div>
                    ) : showUnallocated ? (
                      <UnallocatedTable
                        items={filteredUnallocated.slice(
                          pageStart,
                          pageStart + pageSize,
                        )}
                        ddsEntityId={tableProps.ddsEntityId}
                        onOpenRecord={onOpenRecord}
                      />
                    ) : (
                      <PaymentTable
                        {...tableProps}
                        rows={filteredRows.slice(
                          pageStart,
                          pageStart + pageSize,
                        )}
                        totals={totals}
                      />
                    )}
                  </div>
                  <TablePagination
                    page={currentPage}
                    pageSize={pageSize}
                    pageSizes={ENTITY_TABLE_PAGE_SIZES}
                    total={total}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      if (!isEntityTablePageSize(size)) return;
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                </>
              )}
            </div>
          </>
        )}
      </Tabs>
    </div>
  );
}
