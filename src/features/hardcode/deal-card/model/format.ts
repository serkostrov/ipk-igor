import { formatDateDisplay } from "@/shared/lib/format-date";
import {
  fmtMoney,
  formatPercent,
} from "../../tkp-commercial/model/metric-rows";

export function moneyOrDash(value: number | null | undefined): string {
  return value == null ? "—" : fmtMoney(value);
}

export function percentOrDash(value: number | null | undefined): string {
  return value == null ? "—" : formatPercent(value);
}

export function hoursOrDash(value: number | null | undefined): string {
  return value == null
    ? "—"
    : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ч`;
}

export function dateOrDash(value: string | null | undefined): string {
  return (value && formatDateDisplay(value)) || "—";
}
