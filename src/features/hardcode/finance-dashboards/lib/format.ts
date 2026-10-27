import { formatEntityDecimalTotal } from "@/entities/entity";

const percentFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

export function formatMoney(value: number) {
  return formatEntityDecimalTotal(value);
}

export function formatPercent(value: number) {
  return `${percentFormat.format(value)}%`;
}

export function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${Math.round(value / 1_000_000_000)} млрд`;
  if (abs >= 1_000_000) return `${Math.round(value / 1_000_000)} млн`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)} тыс`;
  return String(Math.round(value));
}

export function formatBarLabelValue(value: unknown) {
  const numeric = Number(value);
  return numeric !== 0 && Number.isFinite(numeric)
    ? formatCompactMoney(numeric)
    : "";
}
