import {
  fromDayNumber,
  toDayNumber,
  todayIsoDate,
} from "@/shared/lib/business-days";
import { formatDateDisplay } from "@/shared/lib/format-date";

export type GraphScale = "day" | "week" | "month" | "year";

export const GRAPH_SCALES: ReadonlyArray<{ value: GraphScale; label: string }> =
  [
    { value: "day", label: "День" },
    { value: "week", label: "Неделя" },
    { value: "month", label: "Месяц" },
    { value: "year", label: "Год" },
  ];

export function parseGraphScale(value: unknown): GraphScale | null {
  return GRAPH_SCALES.some((item) => item.value === value)
    ? (value as GraphScale)
    : null;
}

export type GraphColumn = {
  key: string;
  label: string;
  /** Подпись месяца над колонками дней / недель (пусто для месяцев и лет). */
  band: string;
  start: number;
  days: number;
};

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

/** Запас дней до / после данных, чтобы было куда прокручивать. */
const RANGE_PAD: Record<GraphScale, number> = {
  day: 56,
  week: 126,
  month: 366,
  year: 365 * 3,
};

/** Предел ширины графика (в днях). */
const RANGE_MAX_SPAN: Record<GraphScale, number> = {
  day: 450,
  week: 900,
  month: 1500,
  year: 365 * 20,
};

function parseYearMonth(day: number) {
  const [year, month] = fromDayNumber(day).split("-").map(Number);
  return { year: year!, month: month! };
}

function monthStart(year: number, month: number) {
  return toDayNumber(`${year}-${String(month).padStart(2, "0")}-01`)!;
}

function alignStart(day: number, scale: GraphScale) {
  if (scale === "year") return monthStart(parseYearMonth(day).year, 1);
  if (scale === "month") {
    const { year, month } = parseYearMonth(day);
    return monthStart(year, month);
  }
  let start = day;
  // 1970-01-01 — четверг: (day + 3) % 7 === 0 по понедельникам.
  while ((start + 3) % 7 !== 0) start -= 1;
  return start;
}

function bandLabel(day: number) {
  const { year, month } = parseYearMonth(day);
  return `${MONTHS[month - 1]} ${year}`;
}

/** Колонки графика под выбранный масштаб, охватывающие все даты и сегодня. */
export function buildGraphColumns(
  scale: GraphScale,
  dates: readonly string[],
): GraphColumn[] {
  const today = toDayNumber(todayIsoDate())!;
  let min = today;
  let max = today;
  for (const iso of dates) {
    const day = toDayNumber(iso);
    if (day == null) continue;
    min = Math.min(min, day);
    max = Math.max(max, day);
  }

  let start = alignStart(min - RANGE_PAD[scale], scale);
  let end = max + RANGE_PAD[scale];
  const maxSpan = RANGE_MAX_SPAN[scale];
  if (end - start > maxSpan) {
    const room = Math.max(maxSpan - Math.max(max - min, 0), 0);
    start = alignStart(min - Math.floor(room / 2), scale);
    end = start + maxSpan;
  }

  const columns: GraphColumn[] = [];
  let day = start;
  while (day <= end) {
    let next: number;
    let label: string;
    let key: string;
    let band = "";
    if (scale === "day") {
      next = day + 1;
      key = String(day);
      label = fromDayNumber(day).slice(8, 10);
      band = bandLabel(day);
    } else if (scale === "week") {
      next = day + 7;
      key = String(day);
      label = formatDateDisplay(fromDayNumber(day));
      band = bandLabel(day);
    } else if (scale === "month") {
      const { year, month } = parseYearMonth(day);
      next =
        month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1);
      key = `${year}-${month}`;
      label = bandLabel(day);
    } else {
      const { year } = parseYearMonth(day);
      next = monthStart(year + 1, 1);
      key = String(year);
      label = String(year);
    }
    columns.push({ key, label, band, start: day, days: next - day });
    day = next;
  }
  return columns;
}

export function findGraphColumn(
  columns: readonly GraphColumn[],
  iso: string | null,
): GraphColumn | null {
  const day = iso ? toDayNumber(iso) : null;
  if (day == null) return null;
  return (
    columns.find(
      (column) => day >= column.start && day < column.start + column.days,
    ) ?? null
  );
}
