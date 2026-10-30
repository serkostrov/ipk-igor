import { PROJECT_TIMEZONE } from "@/shared/config/project-time";

const pad = (value: number) => String(value).padStart(2, "0");

export type ProjectZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const zonedPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PROJECT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Calendar + clock parts of an instant in the project timezone. */
export function getProjectZonedParts(
  date: Date = new Date(),
): ProjectZonedParts {
  const bag = Object.fromEntries(
    zonedPartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/**
 * Instant whose wall clock in the project timezone equals the given parts.
 * Moscow is fixed UTC+3 (no DST); Intl still used so the mapping stays correct
 * if zone rules ever change.
 */
export function projectZonedPartsToDate(parts: ProjectZonedParts): Date {
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // Probe: interpret the UTC guess in the project zone, then correct the skew.
  const shown = getProjectZonedParts(new Date(asUtc));
  const shownAsUtc = Date.UTC(
    shown.year,
    shown.month - 1,
    shown.day,
    shown.hour,
    shown.minute,
    shown.second,
  );
  return new Date(asUtc + (asUtc - shownAsUtc));
}

/** Project-zone `YYYY-MM-DD`. */
export function toProjectIsoDate(date: Date = new Date()): string {
  const parts = getProjectZonedParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Project-zone `HH:mm`. */
export function toProjectTimeHHmm(date: Date = new Date()): string {
  const parts = getProjectZonedParts(date);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Project-zone `YYYY-MM-DDTHH:mm:ss` — stored datetime format with seconds. */
export function toLocalDatetime(date: Date = new Date()): string {
  const parts = getProjectZonedParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/** Stored project datetime (`YYYY-MM-DD[THH:mm[:ss]]`) → absolute Date. */
export function parseLocalDatetime(
  value: string | null | undefined,
): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
      value?.trim() ?? "",
    );
  if (!match) return null;
  const [, year, month, day, hours = "0", minutes = "0", seconds = "0"] = match;
  const date = projectZonedPartsToDate({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hours),
    minute: Number(minutes),
    second: Number(seconds),
  });
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Midnight (00:00:00) of a project calendar day as UTC ISO.
 * Used for timestamptz range filters.
 */
export function projectDayStartUtcIso(
  isoDate: string,
  offsetDays = 0,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return null;
  // Calendar day math in UTC noon, then map that Y-M-D midnight in project TZ.
  const shifted = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]) + offsetDays,
      12,
      0,
      0,
    ),
  );
  const date = projectZonedPartsToDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  });
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Elapsed time as `HH:MM:SS`. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
