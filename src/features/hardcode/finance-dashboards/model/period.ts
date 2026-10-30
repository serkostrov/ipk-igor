import { getProjectZonedParts, toProjectIsoDate } from "@/shared/lib/datetime";
import type { FinanceDashboardTab } from "./types";

const STORAGE_KEY = "finance-dashboard-search:v1";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (value: number) => String(value).padStart(2, "0");

/** Instant → project-zone `YYYY-MM-DD` (Europe/Moscow). */
export function localIsoDate(date: Date = new Date()): string {
  return toProjectIsoDate(date);
}

export function monthStartIso(date: Date = new Date()): string {
  const parts = getProjectZonedParts(date);
  return `${parts.year}-${pad(parts.month)}-01`;
}

export function monthEndIso(date: Date = new Date()): string {
  const parts = getProjectZonedParts(date);
  const last = new Date(Date.UTC(parts.year, parts.month, 0));
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}

export function monthStartFromIso(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return `${year}-${month}-01`;
}

export function monthEndFromIso(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  if (!year || !month) return isoDate;
  const last = new Date(Date.UTC(year, month, 0));
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}

export function financeDashboardYearRange(year: number): {
  dateFrom: string;
  dateTo: string;
} {
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}

export function financeDashboardQuickYears(now = new Date()): number[] {
  const year = getProjectZonedParts(now).year;
  return [year - 1, year, year + 1];
}

export type PersistedFinanceDashboardPeriod = {
  dateFrom?: string;
  dateTo?: string;
};

export function loadPersistedFinanceDashboardSearch(): PersistedFinanceDashboardPeriod {
  if (typeof window === "undefined") return {};
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const dateFrom =
        typeof parsed.dateFrom === "string" && ISO_DATE.test(parsed.dateFrom)
          ? parsed.dateFrom
          : undefined;
      const dateTo =
        typeof parsed.dateTo === "string" && ISO_DATE.test(parsed.dateTo)
          ? parsed.dateTo
          : undefined;
      if (dateFrom && dateTo && dateFrom <= dateTo) {
        return { dateFrom, dateTo };
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

export function savePersistedFinanceDashboardSearch(period: {
  dateFrom: string;
  dateTo: string;
}): void {
  if (!period.dateFrom || !period.dateTo || period.dateFrom > period.dateTo) {
    return;
  }
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(period);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    /* ignore */
  }
}

export function isFinanceDashboardTab(
  value: unknown,
): value is FinanceDashboardTab {
  return (
    value === "dds" ||
    value === "lus" ||
    value === "lus-historical" ||
    value === "opiu" ||
    value === "opiu-historical"
  );
}

export function formatFinanceDashboardPeriod(
  dateFrom: string,
  dateTo: string,
): string {
  const format = (iso: string) => {
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return iso;
    return `${d}.${m}.${y}`;
  };
  return `${format(dateFrom)} — ${format(dateTo)}`;
}
