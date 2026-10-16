/** Formats ISO date `YYYY-MM-DD` as `DD.MM.YYYY`. */
export function formatDateDisplay(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate.trim();
  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}

/**
 * Formats stored datetime values for UI.
 * Accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm`, or `YYYY-MM-DD HH:mm`.
 */
export function formatDatetimeDisplay(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed.replace(" ", "T");
  const [date = "", timePart = ""] = normalized.split("T");
  const time = timePart.slice(0, 5);
  const formattedDate = formatDateDisplay(date);

  if (formattedDate && time) return `${formattedDate} ${time}`;
  return formattedDate || trimmed;
}

export function formatDatetimeOrDash(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "—";
  return formatDatetimeDisplay(trimmed) || trimmed;
}

export function splitDatetime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { date: "", time: "" };

  const normalized = trimmed.replace(" ", "T");
  const [date = "", timePart = ""] = normalized.split("T");
  return { date, time: timePart.slice(0, 5) };
}

export function joinDatetime(date: string, time: string) {
  if (!date) return "";
  if (!time) return date;
  return `${date}T${time}`;
}

/** Timestamp with zone (e.g. `timestamptz`) → local `{ date, time }`. */
export function getLocalTimestampParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part: number) => String(part).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** Timestamp with zone → local `DD.MM.YYYY HH:mm`. */
export function formatTimestampDisplay(value: string) {
  const parts = getLocalTimestampParts(value);
  return parts
    ? formatDatetimeDisplay(joinDatetime(parts.date, parts.time))
    : value;
}
