import {
  DEAL_FIX_RATE,
  DEAL_PROFIT_TAX_RATE,
  type DealManualInputs,
  type DealOverrides,
  type DealProfitabilityColumn,
  type DealRevenueSource,
} from "./calculations";
import { moneyOrDash as m, percentOrDash } from "./format";

export type DealCalculationSide = "plan" | "fact";

export type DealCalculationContext = {
  revenueSource: DealRevenueSource;
  manual: DealManualInputs;
  overrides: DealOverrides;
};

export type DealCalculationRow = {
  /** Key of the calculation column this row shows. */
  key: keyof DealProfitabilityColumn;
  label: string;
  value: (column: DealProfitabilityColumn) => number | null;
  percent?: boolean;
  strong?: boolean;
  nested?: boolean;
  /** Tooltip lines: how the number was obtained. */
  explain: (
    side: DealCalculationSide,
    column: DealProfitabilityColumn,
    context: DealCalculationContext,
  ) => string[];
};

const FIX_PERCENT = `${DEAL_FIX_RATE * 100}%`;
const TAX_PERCENT = `${DEAL_PROFIT_TAX_RATE * 100}%`;

const REVENUE_SOURCE_TEXT: Record<DealRevenueSource, string> = {
  "contract-stages": "Сумма этапов договора без НДС",
  "deal-without-vat": "Поле сделки «Сумма (без НДС)» — у договора нет этапов",
  "deal-with-vat-fallback":
    "Поле сделки «Сумма (с НДС)» — суммы без НДС нет (запасной вариант)",
  none: "Сумма не заполнена ни в договоре, ни в сделке",
};

function manualOr(value: number | null, automatic: string[]): string[] {
  return value == null ? automatic : ["Введено вручную на сделке"];
}

export const DEAL_CALCULATION_ROWS: DealCalculationRow[] = [
  {
    key: "revenue",
    label: "Выручка без НДС",
    value: (c) => c.revenue,
    strong: true,
    explain: (side, _c, ctx) =>
      side === "plan"
        ? [REVENUE_SOURCE_TEXT[ctx.revenueSource]]
        : ["Сумма неотклонённых актов сделки без НДС"],
  },
  {
    key: "labor",
    label: "Трудозатраты",
    value: (c) => c.labor,
    nested: true,
    explain: (side) => [
      side === "plan"
        ? "Поле сделки «Плановая себестоимость»"
        : "Поле сделки «Фактическая себестоимость»",
    ],
  },
  {
    key: "supportManager",
    label: "Менеджер сопровождения",
    value: (c) => c.supportManager,
    nested: true,
    explain: (_side, _c, ctx) =>
      manualOr(ctx.manual.supportManager, [
        "Договор без НДС > 1 000 000 ₽ → 50 000 ₽, иначе 25 000 ₽",
        "Правило выключено: у контрагента нет признака сопровождения",
      ]),
  },
  {
    key: "tkpContractors",
    label: "Подрядчики из ТКП",
    value: (c) => c.tkpContractors,
    nested: true,
    explain: (side, _c, ctx) =>
      side === "fact"
        ? ["В факте не учитываются — см. «Внешние подрядчики»"]
        : manualOr(ctx.manual.tkpContractors, [
            "Пока не подтягивается из расчёта ГИПа — введите вручную",
          ]),
  },
  {
    key: "projectExpenses",
    label: "Расходы проекта",
    value: (c) => c.projectExpenses,
    nested: true,
    explain: (side, _c, ctx) =>
      side === "fact"
        ? ["Оплаченные заявки со статьёй «Расходы по проекту»"]
        : manualOr(ctx.manual.tkpExpenses, [
            "Расходы отделов по ТКП — пока вводятся вручную",
          ]),
  },
  {
    key: "trips",
    label: "Командировки",
    value: (c) => c.trips,
    nested: true,
    explain: (side, _c, ctx) =>
      side === "fact"
        ? ["Оплаченные заявки со статьёй командировок по проекту"]
        : manualOr(ctx.manual.tkpTrips, [
            "Командировки по ТКП — пока вводятся вручную",
          ]),
  },
  {
    key: "baseCost",
    label: "Базовая себестоимость",
    value: (c) => c.baseCost,
    strong: true,
    explain: (_side, c) => [
      "Трудозатраты + Менеджер сопровождения + Подрядчики из ТКП + Расходы проекта + Командировки",
      `${m(c.labor)} + ${m(c.supportManager)} + ${m(c.tkpContractors)} + ${m(c.projectExpenses)} + ${m(c.trips)} = ${m(c.baseCost)}`,
    ],
  },
  {
    key: "fix",
    label: `Фикса ${FIX_PERCENT}`,
    value: (c) => c.fix,
    explain: (_side, c) => [
      `Базовая себестоимость × ${FIX_PERCENT}`,
      `${m(c.baseCost)} × ${FIX_PERCENT} = ${m(c.fix)}`,
    ],
  },
  {
    key: "externalContractors",
    label: "Внешние подрядчики",
    value: (c) => c.externalContractors,
    explain: (side) =>
      side === "plan"
        ? ["В плане не учитываются"]
        : ["Оплаченные заявки со статьёй «Подрядчики проекта»"],
  },
  {
    key: "retro",
    label: "Ретро",
    value: (c) => c.retro,
    explain: (_side, _c, ctx) =>
      manualOr(ctx.manual.retro, [
        "Процент от договора без НДС или фиксированная сумма договора",
        "Правило выключено: у контрагента и договора нет полей ретро",
      ]),
  },
  {
    key: "contingency",
    label: "Непредвиденные расходы",
    value: (c) => c.contingency,
    explain: (side) =>
      side === "plan"
        ? ["В плане не учитываются"]
        : ["Оплаченные заявки со статьёй «Непредвиденные расходы»"],
  },
  {
    key: "tax",
    label: `Налог ${TAX_PERCENT}`,
    value: (c) => c.tax,
    explain: (_side, c) =>
      c.revenue == null
        ? ["Выручки нет — налог не считается"]
        : [
            `Выручка без НДС × ${TAX_PERCENT}`,
            `${m(c.revenue)} × ${TAX_PERCENT} = ${m(c.tax)}`,
          ],
  },
  {
    key: "costBeforeBonus",
    label: "Себестоимость до бонуса",
    value: (c) => c.costBeforeBonus,
    strong: true,
    explain: (_side, c) => [
      "Базовая + Фикса + Внешние подрядчики + Ретро + Непредвиденные + Налог",
      `${m(c.baseCost)} + ${m(c.fix)} + ${m(c.externalContractors)} + ${m(c.retro)} + ${m(c.contingency)} + ${m(c.tax ?? 0)} = ${m(c.costBeforeBonus)}`,
    ],
  },
  {
    key: "profitBeforeBonus",
    label: "Прибыль до бонуса",
    value: (c) => c.profitBeforeBonus,
    explain: (_side, c) => [
      "Выручка − Себестоимость до бонуса",
      `${m(c.revenue)} − ${m(c.costBeforeBonus)} = ${m(c.profitBeforeBonus)}`,
    ],
  },
  {
    key: "bonus",
    label: "Бонус сотрудникам",
    value: (c) => c.bonus,
    explain: (side, _c, ctx) =>
      side === "plan"
        ? ["В плане всегда 0"]
        : manualOr(ctx.manual.employeeBonus, ["Не заполнен"]),
  },
  {
    key: "finalCost",
    label: "Итоговая себестоимость",
    value: (c) => c.finalCost,
    strong: true,
    explain: (_side, c) => [
      "Себестоимость до бонуса + Бонус",
      `${m(c.costBeforeBonus)} + ${m(c.bonus)} = ${m(c.finalCost)}`,
    ],
  },
  {
    key: "finalProfit",
    label: "Итоговая прибыль",
    value: (c) => c.finalProfit,
    strong: true,
    explain: (_side, c) => [
      "Выручка − Итоговая себестоимость",
      `${m(c.revenue)} − ${m(c.finalCost)} = ${m(c.finalProfit)}`,
    ],
  },
  {
    key: "profitabilityPercent",
    label: "Рентабельность",
    value: (c) => c.profitabilityPercent,
    percent: true,
    strong: true,
    explain: (_side, c) =>
      c.profitabilityPercent == null
        ? ["Выручки нет — рентабельность не считается"]
        : [
            "Итоговая прибыль ÷ Выручка × 100",
            `${m(c.finalProfit)} ÷ ${m(c.revenue)} × 100 = ${percentOrDash(c.profitabilityPercent)}`,
          ],
  },
];
