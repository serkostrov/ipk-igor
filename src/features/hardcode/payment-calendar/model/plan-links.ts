import { roundMoney } from "../../deal-card/model/calculations";
import type { PaymentKind } from "./types";

/** One planned payment picked in the ДДС form; the amount is the raw input text. */
export type PlanLinkItem = {
  stageId: string;
  partKind: PaymentKind;
  amountText: string;
};

export function planLinkKey(item: Pick<PlanLinkItem, "stageId" | "partKind">) {
  return `${item.stageId}:${item.partKind}`;
}

export function parsePlanLinkAmount(text: string): number {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? roundMoney(value) : Number.NaN;
}

export function sumPlanLinks(items: readonly PlanLinkItem[]): number {
  return roundMoney(
    items.reduce((sum, item) => {
      const amount = parsePlanLinkAmount(item.amountText);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0),
  );
}

/** Error text, or `null` when the links can be saved. */
export function validatePlanLinks(
  items: readonly PlanLinkItem[],
  operationAmount: number | null,
): string | null {
  for (const item of items) {
    const amount = parsePlanLinkAmount(item.amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Укажите положительную сумму для каждого планового платежа.";
    }
  }
  if (operationAmount != null && sumPlanLinks(items) > operationAmount) {
    return "Сумма привязки больше суммы операции.";
  }
  return null;
}
