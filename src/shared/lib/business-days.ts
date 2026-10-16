/**
 * Business-day helpers (Mon–Fri, no holidays) for local `YYYY-MM-DD` dates.
 */

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

/** Local time `HH:mm` of now. */
export function nowTimeHHmm(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Date part of a stored value (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`). */
export function extractIsoDate(
  value: string | null | undefined,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value?.trim() ?? "");
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  const iso = extractIsoDate(value);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function addCalendarDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Business days in `[start, end]` inclusive (empty when `end < start`). */
export function listBusinessDays(start: string, end: string): string[] {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (!from || !to) return [];
  const days: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    if (isBusinessDay(cursor)) days.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Business days in `[start, end]` inclusive; 0 when `end < start`. */
export function businessDaysBetween(start: string, end: string): number | null {
  if (!parseIsoDate(start) || !parseIsoDate(end)) return null;
  return listBusinessDays(start, end).length;
}

/** Business days after `from` up to and including `target` (0 — same day). */
export function businessDaysUntil(target: string, from: string): number | null {
  const start = parseIsoDate(from);
  const end = parseIsoDate(target);
  if (!start || !end) return null;
  if (end.getTime() <= start.getTime()) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() < end.getTime()) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}

/**
 * Shift by `days` business days: each step lands on the next (or previous)
 * business day; 0 keeps the date as is.
 */
export function addBusinessDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  if (!date) return iso;
  const step = days < 0 ? -1 : 1;
  let remaining = Math.abs(Math.round(days));
  while (remaining > 0) {
    date.setDate(date.getDate() + step);
    if (isBusinessDay(date)) remaining -= 1;
  }
  return toIsoDate(date);
}

const DAY_MS = 86_400_000;

/** Whole days since 1970-01-01 for `YYYY-MM-DD` (timezone-independent). */
export function toDayNumber(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  return Math.round(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS,
  );
}

export function fromDayNumber(day: number): string {
  const date = new Date(day * DAY_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function isWeekendDayNumber(day: number): boolean {
  const weekday = new Date(day * DAY_MS).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Business days of a calendar month (`YYYY-MM`). */
export function businessDaysInMonth(month: string): number {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return 0;
  const first = toIsoDate(new Date(year, monthIndex - 1, 1));
  const last = toIsoDate(new Date(year, monthIndex, 0));
  return businessDaysBetween(first, last) ?? 0;
}
