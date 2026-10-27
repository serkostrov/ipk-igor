import {
  UNKNOWN_PROJECT_LABEL,
  type BuildFinanceDashboardInput,
  type DashboardBalanceView,
  type DashboardCategory,
  type DashboardCashflowEntry,
  type FinanceDashboardCashGapPoint,
  type FinanceDashboardData,
  type FinanceDashboardForecastDetail,
  type FinanceDashboardForecastMonth,
  type FinanceDashboardPeriodPoint,
  type FinanceDashboardStructureItem,
} from "./types";

const INTERNAL_TRANSFER_CATEGORY_NAME = "перевод между счетами";
const UNCATEGORIZED_ID = "__uncategorized";
const UNCATEGORIZED_LABEL = "Без статьи";

const RECEIPT_STRUCTURE_COLORS = [
  "#16a34a",
  "#15803d",
  "#0f766e",
  "#0891b2",
  "#2563eb",
  "#65a30d",
  "#ca8a04",
  "#475569",
  "#0ea5e9",
  "#4f46e5",
];

const OUTFLOW_STRUCTURE_COLORS = [
  "#dc2626",
  "#b91c1c",
  "#ea580c",
  "#d97706",
  "#7c2d12",
  "#be123c",
  "#9f1239",
  "#6b7280",
  "#8b5cf6",
  "#2563eb",
];

type CategoryKind =
  "clients" | "vat" | "depositInterest" | "returnsAndSales" | null;

export function normalizeDashboardCategoryName(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyCategoryName(name: string): CategoryKind {
  const normalized = normalizeDashboardCategoryName(name);
  if (!normalized) return null;
  if (normalized.includes("ндс") || normalized.includes("vat")) return "vat";
  if (normalized.includes("депозит") && normalized.includes("процент")) {
    return "depositInterest";
  }
  if (
    normalized.includes("возврат") ||
    (normalized.includes("продаж") &&
      (normalized.includes(" ос ") ||
        normalized.endsWith(" ос") ||
        normalized.includes("основн")))
  ) {
    return "returnsAndSales";
  }
  if (normalized.includes("клиент") || normalized.includes("заказчик")) {
    return "clients";
  }
  return null;
}

function isInternalTransferCategory(category: DashboardCategory) {
  return normalizeDashboardCategoryName(category.name).includes(
    INTERNAL_TRANSFER_CATEGORY_NAME,
  );
}

function dateRangeDays(dateFrom: string, dateTo: string) {
  const result: string[] = [];
  const [fromYear, fromMonth, fromDay] = dateFrom.split("-").map(Number);
  const [toYear, toMonth, toDay] = dateTo.split("-").map(Number);
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay));
  const end = new Date(Date.UTC(toYear, toMonth - 1, toDay));
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function monthKeys(dateFrom: string, dateTo: string) {
  const result: Array<{ key: string; label: string }> = [];
  const [fromYear, fromMonth] = dateFrom.split("-").map(Number);
  const [toYear, toMonth] = dateTo.split("-").map(Number);
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
  const end = new Date(Date.UTC(toYear, toMonth - 1, 1));
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 7);
    result.push({
      key,
      label: `${String(cursor.getUTCMonth() + 1).padStart(2, "0")}.${cursor.getUTCFullYear()}`,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function shortDateLabel(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}.${month}`;
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function entryAmountDelta(
  entry: { amount: number },
  movement: "Поступление" | "Выбытие" | null,
) {
  if (movement === "Поступление") return entry.amount;
  if (movement === "Выбытие") return -entry.amount;
  return 0;
}

function categoryMatchesBalanceView(
  category: DashboardCategory | null | undefined,
  view: DashboardBalanceView | undefined,
) {
  return (
    view !== "own" ||
    (category?.wallet_part !== "overdraft" &&
      category?.wallet_part !== "factoring")
  );
}

/** Keep chart series dense enough for trends without freezing on year ranges. */
export function sampleCashGapPointsForChart<T>(
  points: readonly T[],
  maxPoints = 120,
): T[] {
  if (points.length <= maxPoints) return [...points];
  const lastIndex = points.length - 1;
  const step = Math.max(1, Math.ceil(lastIndex / (maxPoints - 1)));
  const sampled: T[] = [];
  for (let index = 0; index < lastIndex; index += step) {
    sampled.push(points[index]!);
  }
  if (sampled[sampled.length - 1] !== points[lastIndex]) {
    sampled.push(points[lastIndex]!);
  }
  return sampled;
}

export function buildFinanceDashboardData(
  input: BuildFinanceDashboardInput,
): FinanceDashboardData {
  const categoryById = new Map(
    input.categories.map((category) => [category.id, category]),
  );
  const walletById = new Map(
    input.wallets.map((wallet) => [wallet.id, wallet]),
  );

  const childrenByParent = new Map<string, DashboardCategory[]>();
  for (const category of input.categories) {
    if (!category.parent_id) continue;
    const children = childrenByParent.get(category.parent_id) ?? [];
    children.push(category);
    childrenByParent.set(category.parent_id, children);
  }

  const descendantsById = new Map<string, string[]>();
  const collectDescendants = (
    categoryId: string,
    seen = new Set<string>(),
  ): string[] => {
    if (seen.has(categoryId)) return [];
    seen.add(categoryId);
    const result = [categoryId];
    for (const child of childrenByParent.get(categoryId) ?? []) {
      result.push(...collectDescendants(child.id, seen));
    }
    return result;
  };
  for (const category of input.categories) {
    descendantsById.set(category.id, collectDescendants(category.id));
  }

  const internalTransferCategoryIds = new Set<string>();
  for (const category of input.categories) {
    if (!isInternalTransferCategory(category)) continue;
    for (const categoryId of descendantsById.get(category.id) ?? [
      category.id,
    ]) {
      internalTransferCategoryIds.add(categoryId);
    }
  }

  const rootCategoryById = new Map<string, string>();
  const getRootCategoryId = (categoryId: string | null | undefined): string => {
    if (!categoryId) return UNCATEGORIZED_ID;
    const cached = rootCategoryById.get(categoryId);
    if (cached) return cached;
    let current = categoryById.get(categoryId);
    if (!current) return UNCATEGORIZED_ID;
    const seen = new Set<string>();
    while (current.parent_id && !seen.has(current.id)) {
      const parent = categoryById.get(current.parent_id);
      if (!parent) break;
      seen.add(current.id);
      current = parent;
    }
    const rootId = current?.id ?? categoryId;
    rootCategoryById.set(categoryId, rootId);
    return rootId;
  };

  const getCategoryKind = (
    categoryId: string | null | undefined,
  ): CategoryKind => {
    if (!categoryId) return null;
    const category = categoryById.get(categoryId);
    const root = categoryById.get(getRootCategoryId(categoryId));
    const rootKind = root ? classifyCategoryName(root.name) : null;
    const categoryKind = category ? classifyCategoryName(category.name) : null;
    if (rootKind === "clients" && categoryKind === "returnsAndSales") {
      return rootKind;
    }
    return categoryKind ?? rootKind;
  };

  const categoryLabel = (categoryId: string) =>
    categoryId === UNCATEGORIZED_ID
      ? UNCATEGORIZED_LABEL
      : (categoryById.get(categoryId)?.name ?? UNCATEGORIZED_LABEL);

  const isLegalInScope = (legalEntityId: string | null | undefined) =>
    !input.selectedLegalId || legalEntityId === input.selectedLegalId;
  const walletLegalId = (walletId: string | null | undefined) =>
    walletId ? (walletById.get(walletId)?.legal_entity_id ?? null) : null;
  const isProjectInScope = (projectId: string | null | undefined) =>
    !input.selectedProjectId || projectId === input.selectedProjectId;
  const isWalletInScope = (wallet: (typeof input.wallets)[number]) =>
    wallet.is_active && isLegalInScope(wallet.legal_entity_id);
  const entryLegalId = (entry: DashboardCashflowEntry) =>
    entry.legal_entity_id ?? walletLegalId(entry.wallet_id);
  const isEntryInScope = (entry: DashboardCashflowEntry) =>
    isLegalInScope(entryLegalId(entry)) && isProjectInScope(entry.project_id);

  const activeWallets = input.wallets.filter(isWalletInScope);
  const activeWalletIds = new Set(activeWallets.map((wallet) => wallet.id));

  const isBusinessCategory = (categoryId: string | null | undefined) => {
    if (!categoryId) return true;
    if (internalTransferCategoryIds.has(categoryId)) return false;
    const category = categoryById.get(categoryId);
    return (
      category?.activity_type !== "Техническая операция" &&
      categoryMatchesBalanceView(category, input.balanceView)
    );
  };

  const businessEntries = input.entries.filter((entry) => {
    if (!entry.is_done) return false;
    if (!isEntryInScope(entry)) return false;
    if (entry.entry_date < input.dateFrom || entry.entry_date > input.dateTo) {
      return false;
    }
    if (!isBusinessCategory(entry.category_id)) return false;
    return entry.movement === "Поступление" || entry.movement === "Выбытие";
  });

  const netAmountByRoot = new Map<string, number>();
  const monthlyByKey = new Map<string, FinanceDashboardPeriodPoint>();
  const monthlyNetAmountByRoot = new Map<string, Map<string, number>>();
  for (const month of monthKeys(input.dateFrom, input.dateTo)) {
    monthlyByKey.set(month.key, {
      key: month.key,
      label: month.label,
      receipts: 0,
      outflows: 0,
      net: 0,
    });
    monthlyNetAmountByRoot.set(month.key, new Map());
  }

  let clientReceipts = 0;
  let vatReceipts = 0;
  let depositInterest = 0;
  let returnsAndSales = 0;

  for (const entry of businessEntries) {
    const rootCategoryId = getRootCategoryId(entry.category_id);
    const delta = entryAmountDelta(entry, entry.movement);
    addToMap(netAmountByRoot, rootCategoryId, delta);
    const monthNet = monthlyNetAmountByRoot.get(entry.entry_date.slice(0, 7));
    if (monthNet) addToMap(monthNet, rootCategoryId, delta);

    const root = categoryById.get(rootCategoryId);
    const rootName = root?.name ?? "";
    const rootIsReceipt =
      classifyCategoryName(rootName) === "clients" ||
      classifyCategoryName(rootName) === "vat" ||
      classifyCategoryName(rootName) === "depositInterest" ||
      classifyCategoryName(rootName) === "returnsAndSales" ||
      entry.movement === "Поступление";

    if (rootIsReceipt && entry.movement === "Поступление") {
      const kind = getCategoryKind(entry.category_id);
      if (kind === "clients") clientReceipts += delta;
      if (kind === "vat") vatReceipts += delta;
      if (kind === "depositInterest") depositInterest += delta;
      if (kind === "returnsAndSales") returnsAndSales += delta;
    }
  }

  const hasReturnsAndSalesCategory = input.categories.some(
    (category) =>
      category.is_active &&
      isBusinessCategory(category.id) &&
      getCategoryKind(category.id) === "returnsAndSales",
  );

  const receiptsByRoot = new Map<string, number>();
  const outflowsByRoot = new Map<string, number>();
  for (const [categoryId, netAmount] of netAmountByRoot) {
    if (netAmount > 0) receiptsByRoot.set(categoryId, netAmount);
    else if (netAmount < 0) outflowsByRoot.set(categoryId, -netAmount);
  }

  for (const [monthKey, netAmountsByRoot] of monthlyNetAmountByRoot) {
    const month = monthlyByKey.get(monthKey);
    if (!month) continue;
    for (const netAmount of netAmountsByRoot.values()) {
      month.net += netAmount;
      if (netAmount > 0) month.receipts += netAmount;
      else if (netAmount < 0) month.outflows -= netAmount;
    }
  }

  const receipts = Array.from(receiptsByRoot.values()).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const outflows = Array.from(outflowsByRoot.values()).reduce(
    (sum, amount) => sum + amount,
    0,
  );

  const buildStructure = (
    map: Map<string, number>,
    palette: readonly string[],
  ): FinanceDashboardStructureItem[] => {
    const total = Array.from(map.values()).reduce(
      (sum, amount) => sum + amount,
      0,
    );
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([categoryId, amount], index) => ({
        id: categoryId,
        name: categoryLabel(categoryId),
        amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
        color: palette[index % palette.length]!,
      }));
  };

  // Opening / closing: starting balances + cumulative ops (no server anchors).
  const factEntriesForBalances = input.entries.filter((entry) => {
    if (!entry.is_done) return false;
    if (!entry.wallet_id || !activeWalletIds.has(entry.wallet_id)) return false;
    if (!isEntryInScope(entry)) return false;
    return entry.movement === "Поступление" || entry.movement === "Выбытие";
  });

  const startingOwn = activeWallets.reduce(
    (sum, wallet) => sum + wallet.starting_balance,
    0,
  );
  let beginOwn = startingOwn;
  let endOwn = startingOwn;
  for (const entry of factEntriesForBalances) {
    const delta = entryAmountDelta(entry, entry.movement);
    if (entry.entry_date < input.dateFrom) beginOwn += delta;
    if (entry.entry_date <= input.dateTo) endOwn += delta;
  }

  const toSnapshot = (own: number) => ({
    main: own,
    deposit: 0,
    own,
    overdraft: 0,
    factoring: 0,
    withCredit: own,
  });

  const balances = {
    begin: toSnapshot(beginOwn),
    end: toSnapshot(endOwn),
  };

  // Daily cash gap (fact through today, plan after).
  const factDeltaByDay = new Map<string, number>();
  for (const entry of factEntriesForBalances) {
    addToMap(
      factDeltaByDay,
      entry.entry_date,
      entryAmountDelta(entry, entry.movement),
    );
  }

  const planDeltaByDay = new Map<string, number>();
  for (const receipt of input.plannedReceipts) {
    if (!receipt.wallet_id || !activeWalletIds.has(receipt.wallet_id)) continue;
    if (
      !isLegalInScope(
        receipt.legal_entity_id ?? walletLegalId(receipt.wallet_id),
      )
    ) {
      continue;
    }
    if (!isProjectInScope(receipt.project_id)) continue;
    if (receipt.remaining <= 0) continue;
    addToMap(planDeltaByDay, receipt.entry_date, receipt.remaining);
  }
  for (const outflow of input.plannedOutflows) {
    if (input.selectedProjectId) continue;
    if (!outflow.wallet_id || !activeWalletIds.has(outflow.wallet_id)) continue;
    if (
      !isLegalInScope(
        outflow.legal_entity_id ?? walletLegalId(outflow.wallet_id),
      )
    ) {
      continue;
    }
    if (outflow.remaining <= 0) continue;
    addToMap(planDeltaByDay, outflow.entry_date, -outflow.remaining);
  }

  let factRunning =
    startingOwn +
    [...factDeltaByDay.entries()]
      .filter(([date]) => date < input.dateFrom && date <= input.today)
      .reduce((sum, [, value]) => sum + value, 0);
  const factAsOfToday =
    startingOwn +
    [...factDeltaByDay.entries()]
      .filter(([date]) => date <= input.today)
      .reduce((sum, [, value]) => sum + value, 0);
  let planRunning = 0;

  const dailyCashGap: FinanceDashboardCashGapPoint[] = dateRangeDays(
    input.dateFrom,
    input.dateTo,
  ).map((date) => {
    if (date <= input.today) {
      factRunning += factDeltaByDay.get(date) ?? 0;
    } else {
      planRunning += planDeltaByDay.get(date) ?? 0;
    }
    const balance =
      date <= input.today ? factRunning : factAsOfToday + planRunning;
    return {
      date,
      label: shortDateLabel(date),
      ownBalance: balance,
      withCreditBalance: balance,
      balance,
      positiveBalance: Math.max(balance, 0),
      negativeBalance: Math.min(balance, 0),
      source: date <= input.today ? "Факт" : "План",
    };
  });

  // Forecast: fact receipts in period + future planned receipts.
  const forecastMonthlyByKey = new Map<string, FinanceDashboardForecastMonth>();
  for (const month of monthKeys(input.dateFrom, input.dateTo)) {
    forecastMonthlyByKey.set(month.key, {
      ...month,
      factAmount: 0,
      planAmount: 0,
      amount: 0,
    });
  }
  const forecastDetailsByKey = new Map<
    string,
    FinanceDashboardForecastDetail
  >();
  const addForecastDetail = (
    detail: Omit<FinanceDashboardForecastDetail, "key" | "projectName"> & {
      projectTitle: string | null;
    },
  ) => {
    const projectName = detail.projectTitle?.trim() || UNKNOWN_PROJECT_LABEL;
    const key = JSON.stringify([
      detail.source,
      detail.date,
      detail.projectId,
      projectName,
    ]);
    const existing = forecastDetailsByKey.get(key);
    if (existing) {
      existing.amount += detail.amount;
    } else {
      forecastDetailsByKey.set(key, {
        key,
        projectId: detail.projectId,
        projectName,
        date: detail.date,
        amount: detail.amount,
        source: detail.source,
      });
    }
    const month = forecastMonthlyByKey.get(detail.date.slice(0, 7));
    if (month) {
      month.amount += detail.amount;
      if (detail.source === "Факт") month.factAmount += detail.amount;
      if (detail.source === "План") month.planAmount += detail.amount;
    }
  };

  const factNetByRoot = new Map<string, number>();
  for (const entry of businessEntries) {
    if (entry.entry_date > input.today) continue;
    addToMap(
      factNetByRoot,
      getRootCategoryId(entry.category_id),
      entryAmountDelta(entry, entry.movement),
    );
  }
  const receiptRootSet = new Set(
    [...factNetByRoot].filter(([, net]) => net > 0).map(([id]) => id),
  );
  for (const entry of businessEntries) {
    if (
      !receiptRootSet.has(getRootCategoryId(entry.category_id)) ||
      entry.entry_date > input.today
    ) {
      continue;
    }
    addForecastDetail({
      projectId: entry.project_id,
      projectTitle: entry.project_title,
      date: entry.entry_date,
      amount: entryAmountDelta(entry, entry.movement),
      source: "Факт",
    });
  }
  for (const receipt of input.plannedReceipts) {
    if (!receipt.wallet_id || !activeWalletIds.has(receipt.wallet_id)) continue;
    if (
      !isLegalInScope(
        receipt.legal_entity_id ?? walletLegalId(receipt.wallet_id),
      )
    ) {
      continue;
    }
    if (!isProjectInScope(receipt.project_id)) continue;
    if (
      receipt.entry_date < input.dateFrom ||
      receipt.entry_date > input.dateTo ||
      receipt.entry_date <= input.today
    ) {
      continue;
    }
    if (receipt.remaining <= 0) continue;
    addForecastDetail({
      projectId: receipt.project_id,
      projectTitle: receipt.project_title,
      date: receipt.entry_date,
      amount: receipt.remaining,
      source: "План",
    });
  }

  const forecastDetails = Array.from(forecastDetailsByKey.values()).sort(
    (left, right) => {
      if (left.date !== right.date) return left.date.localeCompare(right.date);
      if (left.projectName !== right.projectName) {
        return left.projectName.localeCompare(right.projectName);
      }
      return left.source.localeCompare(right.source);
    },
  );

  const overdraftLimit = activeWallets.reduce(
    (sum, wallet) => sum + wallet.overdraft_limit,
    0,
  );
  const factoringLimit = activeWallets.reduce(
    (sum, wallet) => sum + wallet.factoring_limit,
    0,
  );

  const beginBalance =
    input.balanceView === "own"
      ? balances.begin.own
      : balances.begin.withCredit;
  const endBalance =
    input.balanceView === "own" ? balances.end.own : balances.end.withCredit;

  return {
    balances,
    totals: {
      beginBalance,
      endBalance,
      receipts,
      clientReceipts,
      vatReceipts,
      depositInterest,
      returnsAndSales,
      hasReturnsAndSalesCategory,
      outflows,
      netFlow: receipts - outflows,
    },
    credit: {
      overdraftLimit,
      overdraftUsed: 0,
      factoringLimit,
      factoringUsed: 0,
    },
    periodBars: [
      { name: "Приход", amount: receipts, fill: "#16a34a" },
      { name: "Расход", amount: outflows, fill: "#dc2626" },
    ],
    monthly: Array.from(monthlyByKey.values()),
    receiptsStructure: buildStructure(receiptsByRoot, RECEIPT_STRUCTURE_COLORS),
    outflowsStructure: buildStructure(outflowsByRoot, OUTFLOW_STRUCTURE_COLORS),
    dailyCashGap,
    forecast: {
      factTotal: forecastDetails.reduce(
        (sum, detail) => sum + (detail.source === "Факт" ? detail.amount : 0),
        0,
      ),
      planTotal: forecastDetails.reduce(
        (sum, detail) => sum + (detail.source === "План" ? detail.amount : 0),
        0,
      ),
      total: forecastDetails.reduce((sum, detail) => sum + detail.amount, 0),
      monthly: Array.from(forecastMonthlyByKey.values()),
      details: forecastDetails,
    },
    activeWalletsCount: activeWallets.length,
  };
}
