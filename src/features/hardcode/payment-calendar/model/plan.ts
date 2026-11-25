import {
  addBusinessDays,
  addCalendarDays,
  extractIsoDate,
} from "@/shared/lib/business-days";
import { roundMoney } from "../../deal-card/model/calculations";
import type { CalendarStage, DaysKind, PlannedPart } from "./types";

function addDays(iso: string, days: number, kind: DaysKind): string {
  return kind === "business"
    ? addBusinessDays(iso, days)
    : addCalendarDays(iso, days);
}

/**
 * Дата постоплаты = окончание этапа + срок приёмки + период отсрочки.
 * Оба периода считаются последовательно, каждый со своим типом дней.
 */
export function resolvePostpayDate(stage: CalendarStage): string | null {
  const end = extractIsoDate(stage.endDate);
  if (!end) return null;
  const accepted = addDays(end, stage.acceptanceDays, stage.acceptanceKind);
  return addDays(accepted, stage.deferralDays, stage.deferralKind);
}

/** Сумма аванса: сумма важнее процента, но не больше стоимости этапа. */
export function resolveAdvanceAmount(stage: CalendarStage): number {
  const cost = stage.cost ?? 0;
  if (stage.condition === "advance") return cost;
  if (stage.condition === "postpay") return 0;
  const raw =
    stage.advanceAmount ??
    (stage.advancePercent != null ? (cost * stage.advancePercent) / 100 : 0);
  return roundMoney(Math.min(cost, Math.max(0, raw)));
}

/** Процент аванса — считается из суммы, если пользователь указал сумму. */
export function resolveAdvancePercent(stage: CalendarStage): number | null {
  const cost = stage.cost ?? 0;
  if (cost <= 0) return null;
  return roundMoney((resolveAdvanceAmount(stage) / cost) * 100);
}

/**
 * Плановые платежи этапа: одна запись (аванс или постоплата) либо две
 * (аванс + постоплата).
 */
export function buildStageParts(stage: CalendarStage): PlannedPart[] {
  const cost = stage.cost;
  if (cost == null || cost <= 0) return [];
  const advance = resolveAdvanceAmount(stage);
  const postpay = roundMoney(cost - advance);

  const parts: PlannedPart[] = [];
  if (advance > 0) {
    parts.push({
      key: `${stage.id}:advance`,
      stage,
      kind: "advance",
      dueDate:
        extractIsoDate(stage.advanceDate) ?? extractIsoDate(stage.startDate),
      amount: advance,
    });
  }
  if (postpay > 0) {
    parts.push({
      key: `${stage.id}:postpay`,
      stage,
      kind: "postpay",
      dueDate: resolvePostpayDate(stage),
      amount: postpay,
    });
  }
  return parts;
}
