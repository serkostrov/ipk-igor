const pad = (value: number) => String(value).padStart(2, "0");

/** Local `YYYY-MM-DDTHH:mm:ss` — stored datetime format with seconds. */
export function toLocalDatetime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Stored local datetime (`YYYY-MM-DD[THH:mm[:ss]]`) → Date. */
export function parseLocalDatetime(
  value: string | null | undefined,
): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
      value?.trim() ?? "",
    );
  if (!match) return null;
  const [, year, month, day, hours = "0", minutes = "0", seconds = "0"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Elapsed time as `HH:MM:SS`. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
