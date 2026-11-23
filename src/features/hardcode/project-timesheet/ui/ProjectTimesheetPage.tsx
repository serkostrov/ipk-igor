import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertCircle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Timer,
} from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { isAdminRole, useCurrentRole } from "@/entities/access";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { shiftProjectTimesheetMonth } from "../model/aggregate";
import { renderTimesheetColumn } from "../model/config";
import { useProjectTimesheet } from "../lib/use-project-timesheet";
import type {
  ProjectTimesheetAccessScope,
  ProjectTimesheetDayColumn,
  ProjectTimesheetDayTotal,
  ProjectTimesheetEmployee,
  ProjectTimesheetPayload,
  ProjectTimesheetRow,
  ProjectTimesheetTotal,
} from "../model/contracts";

const DAY_COLUMN_WIDTH = 48;

/**
 * One left-hand column descriptor, built from an admin-configured display
 * column (content via `renderTimesheetColumn`) or the structural label column.
 * `left` is the sticky offset in px, or null when the column scrolls.
 */
type LeftColumn = {
  key: string;
  label: string;
  width: number;
  left: number | null;
  render: (row: ProjectTimesheetRow) => ReactNode;
};

/**
 * Left-hand columns = a structural label column (always first; it carries the
 * employee / department / period label on summary rows and stays blank on task
 * rows) followed by the admin's configured display columns. There is no
 * built-in data layout — every row's content comes from configured columns.
 */
function buildLeftColumns(data: ProjectTimesheetPayload): LeftColumn[] {
  const label: LeftColumn = {
    key: "__label__",
    label: "Сотрудник / ресурс",
    width: 200,
    left: null,
    render: (row) => <span className="sr-only">{row.employeeName}</span>,
  };
  const sticky: LeftColumn[] = [label];
  const flow: LeftColumn[] = [];
  for (const col of data.columns) {
    const descriptor: LeftColumn = {
      key: col.key,
      label: col.label,
      width: col.width > 0 ? col.width : 160,
      left: null,
      render: (row) => (
        <div className="line-clamp-3 whitespace-pre-line">
          {renderTimesheetColumn(col, row.cells)}
        </div>
      ),
    };
    (col.sticky ? sticky : flow).push(descriptor);
  }
  let offset = 0;
  for (const column of sticky) {
    column.left = offset;
    offset += column.width;
  }
  return [...sticky, ...flow];
}

function moscowCurrentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

function formatHours(seconds: number): string {
  if (seconds <= 0) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(seconds / 3_600);
}

function formatPlannedHours(hours: number | null): string {
  if (hours === null) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(hours);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${month}-01T00:00:00+03:00`));
}

function scopeLabel(scope: ProjectTimesheetAccessScope): string {
  if (scope === "global") return "Все сотрудники";
  if (scope === "department") return "Свой отдел";
  if (scope === "gip_users") return "Все ГИПы";
  if (scope === "project_access") return "Доступные проекты";
  return "Только свои строки";
}

function dayValue(days: ProjectTimesheetDayTotal[], date: string): number {
  return days.find((day) => day.date === date)?.durationSeconds ?? 0;
}

function leftCellStyle(column: LeftColumn): CSSProperties {
  return {
    left: column.left ?? undefined,
    minWidth: column.width,
    width: column.width,
    maxWidth: column.width,
  };
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** One left-hand cell, pinned when its column is sticky (has a `left` offset). */
function LeftCell({
  column,
  children,
  className,
  header = false,
}: {
  column: LeftColumn;
  children?: ReactNode;
  className?: string;
  header?: boolean;
}) {
  const Component = header ? "th" : "td";
  const isSticky = column.left !== null;
  return (
    <Component
      data-sticky-column={column.key}
      style={leftCellStyle(column)}
      className={cn(
        "border-b border-r border-border px-2 py-1.5 text-left align-top",
        isSticky && "sticky z-20",
        header
          ? cn(
              "bg-muted font-semibold shadow-[inset_0_-1px_0_var(--border)]",
              isSticky && "z-50",
            )
          : isSticky &&
              "bg-card shadow-[4px_0_6px_-6px_rgba(0,0,0,0.3)]",
        className,
      )}
    >
      {children}
    </Component>
  );
}

function DayCells({
  columns,
  days,
  className,
}: {
  columns: ProjectTimesheetDayColumn[];
  days: ProjectTimesheetDayTotal[];
  className?: string;
}) {
  return columns.map((column) => {
    const seconds = dayValue(days, column.date);
    return (
      <td
        key={column.date}
        data-timesheet-date={column.date}
        style={{ minWidth: DAY_COLUMN_WIDTH, width: DAY_COLUMN_WIDTH }}
        className={cn(
          "border-b border-r border-border px-1 py-1.5 text-center align-top tabular-nums",
          column.isWeekend && "bg-muted/40",
          className,
        )}
      >
        {seconds > 0 ? formatHours(seconds) : ""}
      </td>
    );
  });
}

function SummaryRow({
  kind,
  label,
  plannedHours,
  durationSeconds,
  days,
  leftColumns,
  dayColumns,
  dateFrom,
  dateTo,
}: {
  kind: "period" | "department" | "employee";
  label: string;
  plannedHours: number;
  durationSeconds: number;
  days: ProjectTimesheetDayTotal[];
  leftColumns: LeftColumn[];
  dayColumns: ProjectTimesheetDayColumn[];
  dateFrom?: string;
  dateTo?: string;
}) {
  const tone =
    kind === "period"
      ? "bg-primary/10 font-bold"
      : kind === "department"
        ? "bg-muted font-semibold"
        : "bg-muted/60 font-semibold";
  const stickyTone =
    kind === "period"
      ? "bg-[color-mix(in_srgb,var(--primary)_19%,var(--card))]"
      : "bg-muted";
  return (
    <tr className={tone}>
      {leftColumns.map((column, index) => (
        <LeftCell
          key={column.key}
          column={column}
          className={cn(
            column.left !== null && stickyTone,
            index === 0 && "font-semibold",
          )}
        >
          {index === 0 ? label : null}
        </LeftCell>
      ))}
      <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums">
        {formatPlannedHours(plannedHours)}
      </td>
      <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums">
        {formatHours(durationSeconds)}
      </td>
      <td className="border-b border-r border-border px-2 py-1.5 text-center tabular-nums">
        {formatDate(dateFrom ?? null)}
      </td>
      <td className="border-b border-r border-border px-2 py-1.5 text-center tabular-nums">
        {formatDate(dateTo ?? null)}
      </td>
      <DayCells columns={dayColumns} days={days} className={tone} />
    </tr>
  );
}

function TimesheetTaskRow({
  row,
  leftColumns,
  dayColumns,
}: {
  row: ProjectTimesheetRow;
  leftColumns: LeftColumn[];
  dayColumns: ProjectTimesheetDayColumn[];
}) {
  return (
    <tr className="hover:bg-muted/20">
      {leftColumns.map((column) => (
        <LeftCell key={column.key} column={column}>
          {column.render(row)}
        </LeftCell>
      ))}
      <td className="border-b border-r border-border px-2 py-1.5 text-right tabular-nums">
        {formatPlannedHours(row.plannedHours)}
      </td>
      <td className="border-b border-r border-border px-2 py-1.5 text-right font-semibold tabular-nums">
        {formatHours(row.durationSeconds)}
      </td>
      <td className="border-b border-r border-border px-2 py-1.5 text-center tabular-nums">
        {formatDate(row.startDate)}
      </td>
      <td className="border-b border-r border-border px-2 py-1.5 text-center tabular-nums">
        {formatDate(row.finishDate)}
      </td>
      <DayCells columns={dayColumns} days={row.days} />
    </tr>
  );
}

function employeeLabel(employee: ProjectTimesheetEmployee) {
  return employee.archived ? `${employee.name} (архив)` : employee.name;
}

function ProjectTimesheetMatrix({ data }: { data: ProjectTimesheetPayload }) {
  const leftColumns = buildLeftColumns(data);
  return (
    <div className="max-h-[calc(100vh-280px)] overflow-auto rounded-md border border-border bg-card">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[11px]">
        <thead className="sticky top-0 z-40 bg-muted">
          <tr>
            {leftColumns.map((column) => (
              <LeftCell key={column.key} column={column} header>
                {column.label}
              </LeftCell>
            ))}
            {["План, ч", "Факт, ч", "Старт", "Финиш"].map((label) => (
              <th
                key={label}
                className="min-w-[88px] border-b border-r border-border bg-muted px-2 py-1.5 text-center font-semibold shadow-[inset_0_-1px_0_var(--border)]"
              >
                {label}
              </th>
            ))}
            {data.period.days.map((day) => (
              <th
                key={day.date}
                data-timesheet-date={day.date}
                style={{ minWidth: DAY_COLUMN_WIDTH, width: DAY_COLUMN_WIDTH }}
                className={cn(
                  "border-b border-r border-border bg-muted px-1 py-1 text-center font-semibold shadow-[inset_0_-1px_0_var(--border)]",
                  day.isWeekend && "bg-muted-foreground/15",
                )}
              >
                <span className="block tabular-nums">{day.dayOfMonth}</span>
                <span className="block text-[9px] font-normal text-muted-foreground">
                  {day.weekday}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <SummaryRow
            kind="period"
            label={`Итого за ${formatMonth(data.period.month)}`}
            plannedHours={data.period.plannedHours}
            durationSeconds={data.period.durationSeconds}
            days={data.period.dayTotals}
            leftColumns={leftColumns}
            dayColumns={data.period.days}
            dateFrom={data.period.dateFrom}
            dateTo={data.period.dateTo}
          />
          {data.departmentTotals.map((department: ProjectTimesheetTotal) => (
            <SummaryRow
              key={department.id ?? "none"}
              kind="department"
              label={`Отдел: ${department.name}`}
              plannedHours={department.plannedHours}
              durationSeconds={department.durationSeconds}
              days={department.days}
              leftColumns={leftColumns}
              dayColumns={data.period.days}
            />
          ))}
          {data.employees.map((employee) => (
            <Fragment key={employee.id}>
              <SummaryRow
                kind="employee"
                label={employeeLabel(employee)}
                plannedHours={employee.plannedHours}
                durationSeconds={employee.durationSeconds}
                days={employee.days}
                leftColumns={leftColumns}
                dayColumns={data.period.days}
              />
              {employee.rows.map((row) => (
                <TimesheetTaskRow
                  key={row.key}
                  row={row}
                  leftColumns={leftColumns}
                  dayColumns={data.period.days}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterSelect({
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Array<{ id: string; name: string; suffix?: string }>;
}) {
  // base-ui can't map value→label while the popup is closed (items unmount),
  // so resolve the selected label here and render it as the value's content.
  const selected = value ? options.find((option) => option.id === value) : null;
  const selectedLabel = selected
    ? `${selected.name}${selected.suffix ?? ""}`
    : placeholder;
  // A <div>, not <label>: wrapping a base-ui Select in a <label> swallows item
  // clicks (the label re-targets its first control), breaking selection.
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Select
        value={value ?? "all"}
        onValueChange={(next) => onChange(next === "all" ? null : next)}
      >
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder={placeholder}>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
              {option.suffix ?? ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ProjectTimesheetPage() {
  const [month, setMonth] = useState(moscowCurrentMonth);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const isAdmin = isAdminRole(useCurrentRole());

  const { data, isLoading, isError, error, hasSource } = useProjectTimesheet({
    month,
    employeeId,
    departmentId,
    projectId,
    page,
    pageSize,
  });

  const resetPage = () => setPage(1);
  const changeMonth = (nextMonth: string) => {
    setMonth(nextMonth || moscowCurrentMonth());
    resetPage();
  };

  // A filter is hidden when the viewer's ACCESS pins it to one value — not merely
  // when the data happens to have one option. The user's «Отдел» is a single
  // relation, so a department-scoped viewer is locked to one department (no
  // «Отдел» filter); a personal-scoped viewer sees only themselves (no
  // «Сотрудник»). «Проект» has no scope, so it stays whenever there is data.
  // A selected value always keeps its control visible, so it can be cleared.
  const scope = data?.access.scope;
  const showEmployeeFilter =
    (scope !== undefined &&
      scope !== "personal" &&
      (data?.filters.employees.length ?? 0) > 0) ||
    employeeId !== null;
  const showDepartmentFilter =
    (scope !== undefined &&
      scope !== "personal" &&
      scope !== "department" &&
      (data?.filters.departments.length ?? 0) > 0) ||
    departmentId !== null;
  const showProjectFilter =
    (data?.filters.projects.length ?? 0) > 0 || projectId !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Табель времени
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            План и факт по часам за месяц
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-r-none"
              aria-label="Предыдущий месяц"
              onClick={() => changeMonth(shiftProjectTimesheetMonth(month, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <input
              type="month"
              aria-label="Месяц табеля"
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
              className="h-9 w-[150px] border-y border-input bg-background px-2 text-center text-sm capitalize"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-l-none"
              aria-label="Следующий месяц"
              onClick={() => changeMonth(shiftProjectTimesheetMonth(month, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showEmployeeFilter && (
          <FilterSelect
            label="Сотрудник"
            placeholder="Все сотрудники"
            value={employeeId}
            onChange={(value) => {
              setEmployeeId(value);
              resetPage();
            }}
            options={(data?.filters.employees ?? []).map((option) => ({
              id: option.id,
              name: option.name,
              suffix: option.archived ? " (архив)" : "",
            }))}
          />
        )}
        {showDepartmentFilter && (
          <FilterSelect
            label="Отдел"
            placeholder="Все отделы"
            value={departmentId}
            onChange={(value) => {
              setDepartmentId(value);
              resetPage();
            }}
            options={data?.filters.departments ?? []}
          />
        )}
        {showProjectFilter && (
          <FilterSelect
            label="Проект"
            placeholder="Все проекты"
            value={projectId}
            onChange={(value) => {
              setProjectId(value);
              resetPage();
            }}
            options={(data?.filters.projects ?? []).map((option) => ({
              id: option.id,
              name: option.name,
              suffix: option.archived ? " (архив)" : "",
            }))}
          />
        )}
        <div className="grid gap-1 text-xs text-muted-foreground">
          <span>Строк на странице</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value) as 10 | 25 | 50);
              resetPage();
            }}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue>{`${pageSize} сотрудников`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 сотрудников</SelectItem>
              <SelectItem value="25">25 сотрудников</SelectItem>
              <SelectItem value="50">50 сотрудников</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isError && (
        <div className="flex shrink-0 items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Не удалось загрузить табель</div>
            <div className="mt-0.5 text-destructive/80">
              {error instanceof Error
                ? error.message
                : "Повторите попытку позже."}
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard label="Строк" value={data.period.rowCount} />
          <StatCard
            label="План, ч"
            value={formatPlannedHours(data.period.plannedHours)}
          />
          <StatCard
            label="Факт, ч"
            value={formatHours(data.period.durationSeconds)}
          />
          <StatCard label="Доступ" value={scopeLabel(data.access.scope)} />
        </div>
      )}

      {!hasSource && !isLoading && (
        <div className="flex min-h-44 flex-col items-center justify-center rounded-md border border-border bg-card text-center">
          <CalendarClock className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Табель ещё не настроен</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin
              ? "Настройте его в разделе «Настройки → Табель»."
              : "Обратитесь к администратору."}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex min-h-44 items-center justify-center rounded-md border border-border bg-card text-sm text-muted-foreground">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Загрузка табеля…
        </div>
      )}

      {/* Always render the matrix (even with no rows): its «Итого» row shows an
          empty total for the month, like the original. */}
      {data && <ProjectTimesheetMatrix data={data} />}

      {data && data.pagination.totalEmployees > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            Страница {data.pagination.page} из {data.pagination.totalPages} ·{" "}
            {data.pagination.totalRows} строк
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={data.pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Назад
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={data.pagination.page >= data.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Далее
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
