export const PROFIT_LOSS_MONTH_LABELS = [
  "Янв",
  "Февр",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
] as const;

export type ProfitLossRowKind = "money" | "percent";
export type ProfitLossRowTone =
  "default" | "section" | "result" | "dark" | "warning" | "danger";

export type ProfitLossReportRow = {
  key: string;
  label: string;
  values: number[];
  kind?: ProfitLossRowKind;
  level?: number;
  tone?: ProfitLossRowTone;
  total?: number;
  collapsible?: boolean;
  parentKeys?: string[];
};

export type ProfitLossMonth = {
  key: string;
  label: string;
  year: number;
  monthIndex: number;
  startDate: string;
  endDate: string;
};

export type ProfitLossBreakdownItem = {
  id: string;
  name: string;
  amount: number;
  percent: number;
};

export type ProfitLossReport = {
  months: ProfitLossMonth[];
  rows: ProfitLossReportRow[];
  revenueTotal: number;
  totalExpenses: number;
  revenueByLegalEntity: ProfitLossBreakdownItem[];
  revenueByDirection: ProfitLossBreakdownItem[];
};

/** Normalized act for revenue (from «Акты»). */
export type ProfitLossActSource = {
  act_date: string;
  amount_without_vat: number;
};

/** Normalized DDS operation for expense/income lines. */
export type ProfitLossCashflowSource = {
  entry_date: string;
  category_id: string | null;
  /** «Приход» / «Поступление» or «Расход» / «Выбытие». */
  movement: string;
  amount: number;
  rbp_months?: number | null;
};

/** Normalized «Статьи ДДС» node. */
export type ProfitLossCategorySource = {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
};

export type BuildProfitLossReportInput = {
  months: ProfitLossMonth[];
  acts: ProfitLossActSource[];
  entries: ProfitLossCashflowSource[];
  categories: ProfitLossCategorySource[];
};
