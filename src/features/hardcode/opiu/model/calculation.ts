import {
  type BuildProfitLossReportInput,
  type ProfitLossBreakdownItem,
  type ProfitLossCashflowSource,
  type ProfitLossCategorySource,
  type ProfitLossMonth,
  type ProfitLossReport,
  type ProfitLossReportRow,
} from "./types";

type CashflowMode = "income" | "outflow";

export function sumProfitLossValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function profitLossPercentValue(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

export function getProfitLossRow(report: ProfitLossReport, key: string) {
  return report.rows.find((row) => row.key === key) ?? null;
}

/**
 * Live ОПиУ report — port of ipk-new profit-loss-report-calculation
 * without labor API / deal-contract revenue breakdowns.
 */
export function buildProfitLossReport({
  months,
  acts,
  entries,
  categories,
}: BuildProfitLossReportInput): ProfitLossReport {
  const monthIndexByKey = new Map(
    months.map((month, index) => [month.key, index]),
  );
  const zero = () => zeroValues(months.length);
  const outflow = (
    aliases: string[],
    options: { allocate?: boolean; includeDescendants?: boolean } = {},
  ) =>
    cashflowValues(entries, categories, aliases, months, monthIndexByKey, {
      ...options,
      mode: "outflow",
    });
  const income = (
    aliases: string[],
    options: { allocate?: boolean; includeDescendants?: boolean } = {},
  ) =>
    cashflowValues(entries, categories, aliases, months, monthIndexByKey, {
      ...options,
      mode: "income",
    });

  const revenue = zero();
  for (const act of acts) {
    const monthIndex = monthIndexForDate(act.act_date, months, monthIndexByKey);
    if (monthIndex == null) continue;
    revenue[monthIndex]! += act.amount_without_vat;
  }

  const projectExpenses = outflow([
    "Расходы по проектам",
    "Командировки по проектам",
    "Проектные командировки",
  ]);
  const retroBonus = outflow(["Ретро бонус", "Ретро-бонус", "Агентские"]);
  const teamPercent = outflow(["% Команде", "Процент команде", "Команде"]);
  const variableExpenses = addRows(projectExpenses, retroBonus, teamPercent);
  const marginalProfit = subtractRows(revenue, variableExpenses);
  const marginalProfitability = percentRows(marginalProfit, revenue);

  // Labor API omitted — only cashflow aliases (plan).
  const executorLabor = outflow(
    [
      "ФОТ отделов",
      "ГИПы",
      "Рук проектного отдела",
      "Руководитель проектного отдела",
    ],
    { includeDescendants: true },
  );
  const productionSoftware = outflow(["ПО производственное"], {
    allocate: true,
  });
  const sro = outflow(["СРО"], { allocate: true });
  const productionExpenses = addRows(executorLabor, productionSoftware, sro);
  const grossProfit = subtractRows(marginalProfit, productionExpenses);
  const grossProfitability = percentRows(grossProfit, revenue);

  const adminPayroll = outflow(["ФОТ административного персонала"]);
  const payrollTaxes = outflow(["Налоги ФОТ сотрудников компании"]);
  const projectManagersPayroll = outflow(["ФОТ менеджеров проекта"]);
  const officeRent = outflow(["Аренда офиса"]);
  const parkingRent = outflow(["Аренда парковочных мест"]);
  const utilities = outflow(["Коммунальные услуги"]);
  const officeMaintenance = outflow(["Содержание офиса"]);
  const bankExpenses = outflow(["Банковские расходы"]);
  const adminContractors = outflow(["Административные подрядчики"]);
  const personnelExpenses = outflow(["Расходы на персонал"], {
    includeDescendants: false,
  });
  const personnelEducation = outflow(["Обучение персонала"]);
  const personnelHiring = outflow([
    "Поиск и найм персонала",
    "Поиск персонала",
    "Найм персонала",
  ]);
  const personnelTotal = addRows(
    personnelExpenses,
    personnelEducation,
    personnelHiring,
  );
  const commercialExpenses = outflow(["Коммерческие расходы"]);
  const adminSoftware = outflow(["ПО административное"], { allocate: true });
  const osDepreciation = outflow(
    ["Амортизация ОС", "Амортизация основных средств"],
    { allocate: true },
  );
  const leasingDepreciation = outflow(
    ["Амортизация лизинг", "Амортизация лизинга"],
    { allocate: true },
  );
  const indirectExpenses = addRows(
    adminPayroll,
    payrollTaxes,
    projectManagersPayroll,
    officeRent,
    parkingRent,
    utilities,
    officeMaintenance,
    bankExpenses,
    adminContractors,
    personnelTotal,
    commercialExpenses,
    adminSoftware,
    osDepreciation,
    leasingDepreciation,
  );
  const operatingProfit = subtractRows(grossProfit, indirectExpenses);
  const operatingProfitability = percentRows(operatingProfit, revenue);

  const depositIncome = income([
    "% на остаток",
    "Полученные проценты по депозитам",
    "Проценты по депозитам",
  ]);
  const otherIncome = income(["Прочие доходы"], { includeDescendants: false });
  const otherIncomeTotal = addRows(depositIncome, otherIncome);
  const overdraftExpenses = outflow(["% и расходы по овердрафту", "Овердрафт"]);
  const ods = outflow(["ОДС"]);
  const penalties = outflow(["Штрафы, пени", "Штрафы", "Пени"]);
  const otherExpensesTotal = addRows(overdraftExpenses, ods, penalties);
  const financialActivity = subtractRows(otherIncomeTotal, otherExpensesTotal);
  const tax = outflow(["УСН / Налог на прибыль", "УСН", "Налог на прибыль"]);
  const netProfit = subtractRows(
    addRows(operatingProfit, financialActivity),
    tax,
  );
  const netProfitability = percentRows(netProfit, revenue);

  const rows: ProfitLossReportRow[] = [
    {
      key: "break-even",
      label: "Точка безубыточности",
      values: zero(),
      tone: "dark",
    },
    { key: "revenue", label: "Выручка", values: revenue, tone: "section" },
    {
      key: "variable-expenses",
      label: "Переменные расходы",
      values: variableExpenses,
      tone: "section",
      collapsible: true,
    },
    {
      key: "project-expenses",
      label: "Расходы по проектам (расходы по проектам)",
      values: projectExpenses,
      level: 1,
      parentKeys: ["variable-expenses"],
    },
    {
      key: "retro-bonus",
      label: "Ретро бонус (Агентские)",
      values: retroBonus,
      level: 1,
      parentKeys: ["variable-expenses"],
    },
    {
      key: "team-percent",
      label: "Бонусы сотрудникам",
      values: teamPercent,
      level: 1,
      tone: "danger",
      parentKeys: ["variable-expenses"],
    },
    {
      key: "marginal-profit",
      label: "Маржинальная прибыль",
      values: marginalProfit,
      tone: "result",
    },
    {
      key: "marginal-profitability",
      label: "Рентабельность по МП,%",
      values: marginalProfitability,
      kind: "percent",
      total: profitLossPercentValue(
        sumProfitLossValues(marginalProfit),
        sumProfitLossValues(revenue),
      ),
    },
    {
      key: "production-expenses",
      label: "Производственные расходы",
      values: productionExpenses,
      tone: "section",
      collapsible: true,
    },
    {
      key: "executor-labor",
      label: "ФОТ отделов, ГИПы, Рук. проектного отдела",
      values: executorLabor,
      level: 1,
      tone: "danger",
      parentKeys: ["production-expenses"],
    },
    {
      key: "production-software",
      label: "ПО производственное",
      values: productionSoftware,
      level: 1,
      tone: "warning",
      parentKeys: ["production-expenses"],
    },
    {
      key: "sro",
      label: "СРО",
      values: sro,
      level: 1,
      tone: "warning",
      parentKeys: ["production-expenses"],
    },
    {
      key: "gross-profit",
      label: "Валовая прибыль",
      values: grossProfit,
      tone: "result",
    },
    {
      key: "gross-profitability",
      label: "Рентабельность по ВП,%",
      values: grossProfitability,
      kind: "percent",
      total: profitLossPercentValue(
        sumProfitLossValues(grossProfit),
        sumProfitLossValues(revenue),
      ),
    },
    {
      key: "indirect-expenses",
      label: "Косвенные расходы",
      values: indirectExpenses,
      tone: "section",
      collapsible: true,
    },
    {
      key: "admin-payroll",
      label: "ФОТ административного персонала",
      values: adminPayroll,
      level: 1,
      tone: "danger",
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "payroll-taxes",
      label: "Налоги ФОТ сотрудников компании",
      values: payrollTaxes,
      level: 1,
      tone: "danger",
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "project-managers-payroll",
      label: "ФОТ менеджеров проекта",
      values: projectManagersPayroll,
      level: 1,
      tone: "danger",
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "office-rent",
      label: "Аренда офиса",
      values: officeRent,
      level: 1,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "parking-rent",
      label: "Аренда парковочных мест",
      values: parkingRent,
      level: 1,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "utilities",
      label: "Коммунальные услуги",
      values: utilities,
      level: 1,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "office-maintenance",
      label: "Содержание офиса",
      values: officeMaintenance,
      level: 1,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "bank-expenses",
      label: "Банковские расходы",
      values: bankExpenses,
      level: 1,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "admin-contractors",
      label: "Административные подрядчики",
      values: adminContractors,
      level: 1,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "personnel-total",
      label: "Расходы на персонал",
      values: personnelTotal,
      level: 1,
      collapsible: true,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "personnel-expenses",
      label: "Расходы на персонал",
      values: personnelExpenses,
      level: 2,
      parentKeys: ["indirect-expenses", "personnel-total"],
    },
    {
      key: "personnel-education",
      label: "Обучение персонала",
      values: personnelEducation,
      level: 2,
      parentKeys: ["indirect-expenses", "personnel-total"],
    },
    {
      key: "personnel-hiring",
      label: "Поиск и найм персонала",
      values: personnelHiring,
      level: 2,
      parentKeys: ["indirect-expenses", "personnel-total"],
    },
    {
      key: "commercial-expenses",
      label: "Коммерческие расходы",
      values: commercialExpenses,
      level: 1,
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "admin-software",
      label: "ПО административное",
      values: adminSoftware,
      level: 1,
      tone: "warning",
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "os-depreciation",
      label: "Амортизация ОС",
      values: osDepreciation,
      level: 1,
      tone: "warning",
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "leasing-depreciation",
      label: "Амортизация (лизинг)",
      values: leasingDepreciation,
      level: 1,
      tone: "warning",
      parentKeys: ["indirect-expenses"],
    },
    {
      key: "operating-profit",
      label: "Операционная прибыль",
      values: operatingProfit,
      tone: "result",
    },
    {
      key: "operating-profitability",
      label: "Рентабельность по ОП,%",
      values: operatingProfitability,
      kind: "percent",
      total: profitLossPercentValue(
        sumProfitLossValues(operatingProfit),
        sumProfitLossValues(revenue),
      ),
    },
    {
      key: "financial-activity",
      label: "Финансовая деятельность",
      values: financialActivity,
      tone: "dark",
    },
    {
      key: "other-income-total",
      label: "Прочие доходы",
      values: otherIncomeTotal,
      tone: "section",
      collapsible: true,
    },
    {
      key: "deposit-income",
      label: "% на остаток, полученные % по депозитам",
      values: depositIncome,
      level: 1,
      parentKeys: ["other-income-total"],
    },
    {
      key: "other-income",
      label: "Прочие доходы",
      values: otherIncome,
      level: 1,
      parentKeys: ["other-income-total"],
    },
    {
      key: "other-expenses-total",
      label: "Прочие расходы",
      values: otherExpensesTotal,
      tone: "section",
      collapsible: true,
    },
    {
      key: "overdraft-expenses",
      label: "% и расходы по овердрафту",
      values: overdraftExpenses,
      level: 1,
      parentKeys: ["other-expenses-total"],
    },
    {
      key: "ods",
      label: "ОДС",
      values: ods,
      level: 1,
      parentKeys: ["other-expenses-total"],
    },
    {
      key: "penalties",
      label: "Штрафы, пени",
      values: penalties,
      level: 1,
      parentKeys: ["other-expenses-total"],
    },
    {
      key: "tax",
      label: "УСН / Налог на прибыль",
      values: tax,
      tone: "section",
    },
    {
      key: "net-profit",
      label: "Чистая прибыль",
      values: netProfit,
      tone: "result",
    },
    {
      key: "net-profitability",
      label: "Рентабельность по ЧП,%",
      values: netProfitability,
      kind: "percent",
      total: profitLossPercentValue(
        sumProfitLossValues(netProfit),
        sumProfitLossValues(revenue),
      ),
    },
  ];

  const totalExpenses = sumProfitLossValues(
    addRows(
      variableExpenses,
      productionExpenses,
      indirectExpenses,
      otherExpensesTotal,
      tax,
    ),
  );
  const revenueTotal = sumProfitLossValues(revenue);

  return {
    months,
    rows,
    revenueTotal,
    totalExpenses,
    revenueByLegalEntity: [] as ProfitLossBreakdownItem[],
    revenueByDirection: [] as ProfitLossBreakdownItem[],
  };
}

function zeroValues(length: number) {
  return Array.from({ length }, () => 0);
}

function addRows(...rows: number[][]) {
  const length = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length }, (_, index) =>
    rows.reduce((sum, row) => sum + (row[index] ?? 0), 0),
  );
}

function subtractRows(left: number[], right: number[]) {
  return left.map((value, index) => value - (right[index] ?? 0));
}

function percentRows(numerator: number[], denominator: number[]) {
  return numerator.map((value, index) =>
    profitLossPercentValue(value, denominator[index] ?? 0),
  );
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isIncomeMovement(movement: string) {
  const name = normalizeName(movement);
  return (
    name === "поступление" ||
    name === "приход" ||
    name.includes("поступлен") ||
    name.includes("приход")
  );
}

function isOutflowMovement(movement: string) {
  const name = normalizeName(movement);
  return (
    name === "выбытие" ||
    name === "расход" ||
    name.includes("выбыт") ||
    name.includes("расход")
  );
}

function buildChildrenByParent(categories: ProfitLossCategorySource[]) {
  const childrenByParent = new Map<string, ProfitLossCategorySource[]>();
  for (const category of categories) {
    if (!category.parent_id) continue;
    const children = childrenByParent.get(category.parent_id) ?? [];
    children.push(category);
    childrenByParent.set(category.parent_id, children);
  }
  return childrenByParent;
}

function buildDescendantIds(categories: ProfitLossCategorySource[]) {
  const childrenByParent = buildChildrenByParent(categories);
  const descendants = new Map<string, string[]>();
  const collect = (id: string): string[] => {
    const out = [id];
    for (const child of childrenByParent.get(id) ?? []) {
      out.push(...collect(child.id));
    }
    return out;
  };
  for (const category of categories) {
    descendants.set(category.id, collect(category.id));
  }
  return descendants;
}

function categoryIdsByAliases(
  categories: ProfitLossCategorySource[],
  aliases: string[],
  options: { includeDescendants?: boolean } = {},
) {
  const includeDescendants = options.includeDescendants ?? true;
  const normalizedAliases = aliases.map(normalizeName).filter(Boolean);
  const descendants = buildDescendantIds(categories);
  const ids = new Set<string>();
  for (const category of categories) {
    if (!category.is_active) continue;
    const normalizedName = normalizeName(category.name);
    const matched = normalizedAliases.some(
      (alias) =>
        normalizedName === alias ||
        (alias.length > 3 && normalizedName.includes(alias)),
    );
    if (!matched) continue;
    const targetIds = includeDescendants
      ? (descendants.get(category.id) ?? [category.id])
      : [category.id];
    for (const id of targetIds) ids.add(id);
  }
  return ids;
}

function cashflowValues(
  entries: ProfitLossCashflowSource[],
  categories: ProfitLossCategorySource[],
  aliases: string[],
  months: ProfitLossMonth[],
  monthIndexByKey: Map<string, number>,
  options: {
    mode?: CashflowMode;
    allocate?: boolean;
    includeDescendants?: boolean;
  } = {},
) {
  const ids = categoryIdsByAliases(categories, aliases, {
    includeDescendants: options.includeDescendants,
  });
  return ids.size === 0
    ? zeroValues(months.length)
    : cashflowValuesWithCategoryIds(
        entries,
        ids,
        months,
        monthIndexByKey,
        options,
      );
}

function cashflowValuesWithCategoryIds(
  entries: ProfitLossCashflowSource[],
  categoryIds: Set<string>,
  months: ProfitLossMonth[],
  monthIndexByKey: Map<string, number>,
  options: {
    mode?: CashflowMode;
    allocate?: boolean;
  },
) {
  const values = zeroValues(months.length);
  for (const entry of entries) {
    if (!entry.category_id || !categoryIds.has(entry.category_id)) continue;
    if (options.mode === "income" && isOutflowMovement(entry.movement)) {
      continue;
    }
    if (options.mode === "outflow" && isIncomeMovement(entry.movement)) {
      continue;
    }
    addCashflowAmount(values, entry, months, monthIndexByKey, {
      allocate: options.allocate,
    });
  }
  return values;
}

function addCashflowAmount(
  values: number[],
  entry: ProfitLossCashflowSource,
  months: ProfitLossMonth[],
  monthIndexByKey: Map<string, number>,
  options: { allocate?: boolean },
) {
  const parts = dateParts(entry.entry_date);
  if (!parts) return;
  const allocationMonths = options.allocate
    ? Math.max(1, Number(entry.rbp_months ?? 1))
    : 1;
  const amount = Math.abs(Number(entry.amount ?? 0)) / allocationMonths;
  for (let offset = 0; offset < allocationMonths; offset += 1) {
    const absoluteMonth = parts.monthIndex + offset;
    const targetYear = parts.year + Math.floor(absoluteMonth / 12);
    const targetMonth = absoluteMonth % 12;
    const targetDay = Math.min(parts.day, monthEndDay(targetYear, targetMonth));
    const targetDate = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(
      targetDay,
    ).padStart(2, "0")}`;
    const targetIndex = monthIndexForDate(targetDate, months, monthIndexByKey);
    if (targetIndex == null) continue;
    values[targetIndex]! += amount;
  }
}

function dateParts(
  date: string | null | undefined,
): { year: number; monthIndex: number; day: number } | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (
    !Number.isFinite(year) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, monthIndex, day };
}

function monthIndexForDate(
  date: string | null | undefined,
  months: ProfitLossMonth[],
  monthIndexByKey: Map<string, number>,
) {
  if (!date) return null;
  const key = date.slice(0, 7);
  const index = monthIndexByKey.get(key);
  if (index == null) return null;
  const month = months[index];
  if (!month || date < month.startDate || date > month.endDate) return null;
  return index;
}

function monthEndDay(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
