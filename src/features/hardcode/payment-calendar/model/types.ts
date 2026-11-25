export type PaymentKind = "advance" | "postpay";

export type PaymentStatus =
  "planned" | "partial" | "paid" | "overdue" | "overpaid";

/** Условия оплаты этапа: «Аванс» / «Аванс плюс постоплата» / «Полная постоплата». */
export type PaymentCondition = "advance" | "advance-postpay" | "postpay";

export type DaysKind = "calendar" | "business";

/** `entityId` — сущность, которой реально принадлежит запись (`null`, если запись не найдена). */
export type RecordRef = { id: string; name: string; entityId: string | null };

/** Этап договора со всеми полями, нужными для плана (суммы — с НДС). */
export type CalendarStage = {
  id: string;
  name: string;
  contract: RecordRef | null;
  dealId: string | null;
  legal: RecordRef | null;
  counterparty: RecordRef | null;
  startDate: string | null;
  endDate: string | null;
  condition: PaymentCondition;
  cost: number | null;
  advanceAmount: number | null;
  advancePercent: number | null;
  advanceDate: string | null;
  acceptanceDays: number;
  acceptanceKind: DaysKind;
  deferralDays: number;
  deferralKind: DaysKind;
};

/** Фактическое поступление — приходная операция ДДС. */
export type CalendarReceipt = {
  id: string;
  title: string;
  date: string;
  amount: number;
  dealId: string | null;
  contractId: string | null;
  stageId: string | null;
  legalId: string | null;
  counterpartyId: string | null;
};

export type PlannedPart = {
  key: string;
  stage: CalendarStage;
  kind: PaymentKind;
  dueDate: string | null;
  amount: number;
};

export type ReceiptShare = { receiptId: string; amount: number };

export type PaymentRow = PlannedPart & {
  paid: number;
  remaining: number;
  /** Дней просрочки (только для статуса «Просрочен»). */
  overdueDays: number;
  status: PaymentStatus;
  receipts: ReceiptShare[];
};

export type UnallocatedReceipt = {
  receipt: CalendarReceipt;
  amount: number;
};

export type PaymentCalendar = {
  rows: PaymentRow[];
  receiptsById: ReadonlyMap<string, CalendarReceipt>;
  /** Поступления (и их остатки), не отнесённые ни к одному плановому платежу. */
  unallocated: UnallocatedReceipt[];
};

export type PaymentCalendarFilters = {
  period: { start: string; end: string } | null;
  legalId: string | null;
  counterpartyId: string | null;
  status: PaymentStatus | null;
};

export type PaymentCalendarSummary = {
  planned: number;
  received: number;
  expected: number;
  overdue: number;
  partial: number;
  unpaidCount: number;
  unallocated: number;
};
