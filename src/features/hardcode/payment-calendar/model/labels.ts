import type { PaymentKind, PaymentStatus } from "./types";

export const KIND_LABELS: Record<PaymentKind, string> = {
  advance: "Аванс",
  postpay: "Постоплата",
};

export type StatusTone = "success" | "warning" | "danger" | "neutral";

export const STATUS_VIEW: Record<
  PaymentStatus,
  { label: string; tone: StatusTone }
> = {
  planned: { label: "Запланирован", tone: "neutral" },
  partial: { label: "Частично оплачен", tone: "warning" },
  paid: { label: "Оплачен", tone: "success" },
  overdue: { label: "Просрочен", tone: "danger" },
  overpaid: { label: "Переплата", tone: "warning" },
};

export const STATUS_ORDER = Object.keys(STATUS_VIEW) as PaymentStatus[];

/** Цвет ячейки статуса в графике (заливка берётся с прозрачностью). */
export const STATUS_COLORS: Record<PaymentStatus, string> = {
  planned: "#3b82f6",
  partial: "#f59e0b",
  paid: "#10b981",
  overdue: "#ef4444",
  overpaid: "#8b5cf6",
};

export const UNALLOCATED_LABEL = "Нераспределённые";
