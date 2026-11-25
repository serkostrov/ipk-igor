import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { DateRangePicker } from "@/shared/ui/date-range-picker";
import { FilterPill } from "@/shared/ui/filter-pill";
import { Loader } from "@/shared/ui/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { dateOrDash, moneyOrDash } from "../../deal-card/model/format";
import {
  DealEmptyState,
  DealPanel,
  DealRecordLink,
  DealStatusBadge,
} from "../../deal-card/ui/shared";
import { usePaymentCalendar } from "../lib/use-payment-calendar";
import { listMissingPaymentCalendarSources } from "../match";
import {
  countByStatus,
  EMPTY_PAYMENT_FILTERS,
  filterPaymentRows,
  summarizePayments,
} from "../model/filters";
import type {
  PaymentCalendarFilters,
  PaymentKind,
  PaymentRow,
  PaymentStatus,
  RecordRef,
} from "../model/types";

type OpenRecord = (entityId: string, recordId: string) => void;

const KIND_LABELS: Record<PaymentKind, string> = {
  advance: "Аванс",
  postpay: "Постоплата",
};

const STATUS_VIEW: Record<
  PaymentStatus,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  planned: { label: "Запланирован", tone: "neutral" },
  partial: { label: "Частично оплачен", tone: "warning" },
  paid: { label: "Оплачен", tone: "success" },
  overdue: { label: "Просрочен", tone: "danger" },
  overpaid: { label: "Переплата", tone: "warning" },
};

const STATUS_ORDER = Object.keys(STATUS_VIEW) as PaymentStatus[];

function uniqueRefs(refs: Array<RecordRef | null>): RecordRef[] {
  const byId = new Map<string, RecordRef>();
  for (const ref of refs) if (ref) byId.set(ref.id, ref);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function RefFilter({
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  options: RecordRef[];
  onChange: (value: string | null) => void;
}) {
  const selected = options.find((option) => option.id === value);
  // A <div>, not <label>: a label around a base-ui Select swallows item clicks.
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Select
        value={value ?? "all"}
        onValueChange={(next) => onChange(next === "all" ? null : next)}
      >
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder={placeholder}>
            {selected?.name ?? placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{placeholder}</SelectItem>
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

export function PaymentCalendarPage({
  onOpenRecord,
}: {
  onOpenRecord?: OpenRecord;
}) {
  const { sources, ready, calendar } = usePaymentCalendar();
  const [filters, setFilters] = useState<PaymentCalendarFilters>(
    EMPTY_PAYMENT_FILTERS,
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rows = useMemo(() => calendar?.rows ?? [], [calendar]);
  const unallocated = useMemo(() => calendar?.unallocated ?? [], [calendar]);
  const visibleRows = useMemo(
    () => filterPaymentRows(rows, filters),
    [rows, filters],
  );
  const summary = useMemo(
    () => summarizePayments(visibleRows, unallocated),
    [visibleRows, unallocated],
  );
  const counts = useMemo(() => countByStatus(rows, filters), [rows, filters]);
  const legalOptions = useMemo(
    () => uniqueRefs(rows.map((row) => row.stage.legal)),
    [rows],
  );
  const counterpartyOptions = useMemo(
    () => uniqueRefs(rows.map((row) => row.stage.counterparty)),
    [rows],
  );

  const patchFilters = (patch: Partial<PaymentCalendarFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  const missing = listMissingPaymentCalendarSources(sources);
  const total = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-6">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          Платёжный календарь
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Плановые поступления по этапам договоров и фактические оплаты из ДДС
        </p>
      </div>

      {missing.length > 0 ? (
        <DealEmptyState>
          Для календаря не хватает сущностей: {missing.join(", ")}.
        </DealEmptyState>
      ) : !ready || !calendar || !sources ? (
        <Loader block label="Загрузка…" />
      ) : (
        <>
          <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <SummaryCard
              label="Запланировано"
              value={moneyOrDash(summary.planned)}
            />
            <SummaryCard
              label="Поступило"
              value={moneyOrDash(summary.received)}
            />
            <SummaryCard
              label="Ожидается"
              value={moneyOrDash(summary.expected)}
            />
            <SummaryCard
              label="Просрочено"
              value={moneyOrDash(summary.overdue)}
              tone={summary.overdue > 0 ? "danger" : undefined}
            />
            <SummaryCard
              label="Частично оплачено"
              value={moneyOrDash(summary.partial)}
            />
            <SummaryCard
              label="Неоплаченных платежей"
              value={String(summary.unpaidCount)}
            />
            <SummaryCard
              label="Нераспределено"
              value={moneyOrDash(summary.unallocated)}
            />
          </div>

          <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1 text-xs text-muted-foreground">
              <span>Период поступления</span>
              <DateRangePicker
                value={filters.period}
                onChange={(period) => patchFilters({ period })}
                aria-label="Период поступления"
                className="h-9 w-full"
              />
            </div>
            <RefFilter
              label="Юрлицо"
              placeholder="Все юрлица"
              value={filters.legalId}
              options={legalOptions}
              onChange={(legalId) => patchFilters({ legalId })}
            />
            <RefFilter
              label="Контрагент"
              placeholder="Все контрагенты"
              value={filters.counterpartyId}
              options={counterpartyOptions}
              onChange={(counterpartyId) => patchFilters({ counterpartyId })}
            />
          </div>

          <div className="flex shrink-0 flex-wrap gap-1.5">
            <FilterPill
              label="Все"
              count={total}
              active={filters.status === null}
              onClick={() => patchFilters({ status: null })}
            />
            {STATUS_ORDER.map((status) => (
              <FilterPill
                key={status}
                label={STATUS_VIEW[status].label}
                count={counts[status]}
                active={filters.status === status}
                onClick={() => patchFilters({ status })}
              />
            ))}
          </div>

          <DealPanel
            title="Плановые и фактические поступления"
            description="План строится по этапам договоров: аванс и постоплата (окончание этапа + срок приёмки + отсрочка). Фактические оплаты — приходные операции ДДС, привязанные к этапу, договору или сделке."
          >
            {visibleRows.length === 0 ? (
              <DealEmptyState>
                Нет плановых платежей. План строится по этапам договоров с
                суммой.
              </DealEmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>План. дата</TableHead>
                    <TableHead>Договор / этап</TableHead>
                    <TableHead>Юрлицо / контрагент</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead className="text-right">План</TableHead>
                    <TableHead>Факт. дата</TableHead>
                    <TableHead className="text-right">Факт</TableHead>
                    <TableHead className="text-right">Остаток</TableHead>
                    <TableHead className="text-right">Просрочка, дн.</TableHead>
                    <TableHead>Статус</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <PaymentTableRow
                      key={row.key}
                      row={row}
                      expanded={expandedKey === row.key}
                      lastReceiptDate={lastReceiptDate(
                        row,
                        calendar.receiptsById,
                      )}
                      receiptsById={calendar.receiptsById}
                      stageEntityId={sources.stage?.id}
                      ddsEntityId={sources.dds?.id}
                      onToggle={() =>
                        setExpandedKey((current) =>
                          current === row.key ? null : row.key,
                        )
                      }
                      onOpenRecord={onOpenRecord}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </DealPanel>

          {unallocated.length > 0 ? (
            <DealPanel
              title="Нераспределённые поступления"
              description="Приходы ДДС, которые не удалось отнести к плановому платежу: нет связи с этапом, договором или сделкой, либо сумма превышает план."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Операция ДДС</TableHead>
                    <TableHead className="text-right">Нераспределено</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unallocated.map(({ receipt, amount }) => (
                    <TableRow key={receipt.id}>
                      <TableCell>{dateOrDash(receipt.date)}</TableCell>
                      <TableCell>
                        <DealRecordLink
                          entityId={sources.dds?.id}
                          recordId={receipt.id}
                          title={receipt.title}
                          onOpenRelation={onOpenRecord}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {moneyOrDash(amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DealPanel>
          ) : null}
        </>
      )}
    </div>
  );
}

function lastReceiptDate(
  row: PaymentRow,
  receiptsById: ReadonlyMap<string, { date: string }>,
): string | null {
  const dates = row.receipts
    .map((share) => receiptsById.get(share.receiptId)?.date)
    .filter((date): date is string => Boolean(date))
    .sort();
  return dates.at(-1) ?? null;
}

function PaymentTableRow({
  row,
  expanded,
  lastReceiptDate,
  receiptsById,
  stageEntityId,
  ddsEntityId,
  onToggle,
  onOpenRecord,
}: {
  row: PaymentRow;
  expanded: boolean;
  lastReceiptDate: string | null;
  receiptsById: ReadonlyMap<string, { title: string; date: string }>;
  stageEntityId: string | undefined;
  ddsEntityId: string | undefined;
  onToggle: () => void;
  onOpenRecord?: OpenRecord;
}) {
  const { stage } = row;
  const view = STATUS_VIEW[row.status];
  const hasReceipts = row.receipts.length > 0;
  return (
    <Fragment>
      <TableRow>
        <TableCell>
          {hasReceipts ? (
            <button
              type="button"
              aria-label={expanded ? "Скрыть операции" : "Показать операции"}
              className="text-muted-foreground hover:text-foreground"
              onClick={onToggle}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {dateOrDash(row.dueDate)}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            {stage.contract ? (
              <DealRecordLink
                entityId={stage.contract.entityId ?? undefined}
                recordId={stage.contract.id}
                title={stage.contract.name}
                onOpenRelation={onOpenRecord}
              />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            <DealRecordLink
              entityId={stageEntityId}
              recordId={stage.id}
              title={stage.name}
              onOpenRelation={onOpenRecord}
            />
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <span>{stage.legal?.name ?? "—"}</span>
            <span className="text-xs text-muted-foreground">
              {stage.counterparty?.name ?? "—"}
            </span>
          </div>
        </TableCell>
        <TableCell>{KIND_LABELS[row.kind]}</TableCell>
        <TableCell className="text-right tabular-nums">
          {moneyOrDash(row.amount)}
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {dateOrDash(lastReceiptDate)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {moneyOrDash(row.paid)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {moneyOrDash(row.remaining)}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {row.overdueDays > 0 ? row.overdueDays : "—"}
        </TableCell>
        <TableCell>
          <DealStatusBadge tone={view.tone}>{view.label}</DealStatusBadge>
        </TableCell>
      </TableRow>
      {expanded
        ? row.receipts.map((share) => {
            const receipt = receiptsById.get(share.receiptId);
            return (
              <TableRow
                key={`${row.key}:${share.receiptId}`}
                className="bg-muted/30"
              >
                <TableCell />
                <TableCell>{dateOrDash(receipt?.date)}</TableCell>
                <TableCell colSpan={4}>
                  <DealRecordLink
                    entityId={ddsEntityId}
                    recordId={share.receiptId}
                    title={receipt?.title ?? share.receiptId}
                    onOpenRelation={onOpenRecord}
                  />
                </TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {moneyOrDash(share.amount)}
                </TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            );
          })
        : null}
    </Fragment>
  );
}
