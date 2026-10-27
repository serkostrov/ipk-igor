export type FinanceDashboardTab =
  "dds" | "lus" | "lus-historical" | "opiu" | "opiu-historical";

export type DashboardBalanceView = "own" | "withCredit";

export type FinanceDashboardPeriodPoint = {
  key: string;
  label: string;
  receipts: number;
  outflows: number;
  net: number;
};

export type FinanceDashboardStructureItem = {
  id: string;
  name: string;
  amount: number;
  percent: number;
  color: string;
};

export type FinanceDashboardCashGapPoint = {
  date: string;
  label: string;
  ownBalance: number;
  withCreditBalance: number;
  balance: number;
  positiveBalance: number;
  negativeBalance: number;
  source: "Факт" | "План";
};

export type FinanceDashboardBalanceSnapshot = {
  main: number;
  deposit: number;
  own: number;
  overdraft: number;
  factoring: number;
  withCredit: number;
};

export type FinanceDashboardForecastMonth = {
  key: string;
  label: string;
  factAmount: number;
  planAmount: number;
  amount: number;
};

export type FinanceDashboardForecastDetail = {
  key: string;
  projectId: string | null;
  projectName: string;
  date: string;
  amount: number;
  source: "Факт" | "План";
};

export type FinanceDashboardData = {
  balances: {
    begin: FinanceDashboardBalanceSnapshot;
    end: FinanceDashboardBalanceSnapshot;
  };
  totals: {
    beginBalance: number;
    endBalance: number;
    receipts: number;
    clientReceipts: number;
    vatReceipts: number;
    depositInterest: number;
    returnsAndSales: number;
    hasReturnsAndSalesCategory: boolean;
    outflows: number;
    netFlow: number;
  };
  credit: {
    overdraftLimit: number;
    overdraftUsed: number;
    factoringLimit: number;
    factoringUsed: number;
  };
  periodBars: Array<{ name: string; amount: number; fill: string }>;
  monthly: FinanceDashboardPeriodPoint[];
  receiptsStructure: FinanceDashboardStructureItem[];
  outflowsStructure: FinanceDashboardStructureItem[];
  dailyCashGap: FinanceDashboardCashGapPoint[];
  forecast: {
    factTotal: number;
    planTotal: number;
    total: number;
    monthly: FinanceDashboardForecastMonth[];
    details: FinanceDashboardForecastDetail[];
  };
  activeWalletsCount: number;
};

/** Normalized DDS entry for the finance dashboard. */
export type DashboardCashflowEntry = {
  id: string;
  entry_date: string;
  amount: number;
  legal_entity_id: string | null;
  wallet_id: string | null;
  category_id: string | null;
  project_id: string | null;
  project_title: string | null;
  movement: "Поступление" | "Выбытие" | null;
  /** When null, treat as done (entities often have no status). */
  is_done: boolean;
};

export type DashboardCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  /** overdraft / factoring / main / deposit when known */
  wallet_part: "main" | "deposit" | "overdraft" | "factoring" | null;
  activity_type: string | null;
};

export type DashboardWallet = {
  id: string;
  name: string;
  legal_entity_id: string | null;
  is_active: boolean;
  starting_balance: number;
  overdraft_limit: number;
  factoring_limit: number;
};

export type DashboardLegalEntity = {
  id: string;
  name: string;
};

export type DashboardProject = {
  id: string;
  name: string;
};

export type DashboardPlannedItem = {
  id: string;
  entry_date: string;
  amount: number;
  remaining: number;
  wallet_id: string | null;
  legal_entity_id: string | null;
  category_id: string | null;
  project_id: string | null;
  project_title: string | null;
};

export type BuildFinanceDashboardInput = {
  balanceView?: DashboardBalanceView;
  dateFrom: string;
  dateTo: string;
  today: string;
  entries: DashboardCashflowEntry[];
  categories: DashboardCategory[];
  wallets: DashboardWallet[];
  plannedReceipts: DashboardPlannedItem[];
  plannedOutflows: DashboardPlannedItem[];
  selectedLegalId: string | null;
  selectedProjectId: string | null;
};

export const UNKNOWN_PROJECT_LABEL = "Проект не указан";
export const ALL_LEGAL = "__all";
export const ALL_PROJECTS = "__all_projects";
