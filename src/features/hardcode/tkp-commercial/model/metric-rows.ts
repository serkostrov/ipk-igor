import type { TkpCommercialCalculation } from "./commercial";

export type FormulaRow = { label: string; value: string };

export function fmtMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function costWithCoefficientRow(
  calculation: TkpCommercialCalculation,
): FormulaRow {
  return {
    label: "Себестоимость с коммерческим коэффициентом",
    value: fmtMoney(calculation.costWithCoefficient),
  };
}

export function baseBeforeRetroRows(
  calculation: TkpCommercialCalculation,
): FormulaRow[] {
  if (calculation.priceMode === "manual") {
    return [
      {
        label: "Введённая базовая цена без НДС (без РЭТРО)",
        value: fmtMoney(
          calculation.manualTotalBeforeVat ?? calculation.baseTotalBeforeVat,
        ),
      },
      {
        label: "База без РЭТРО",
        value: fmtMoney(calculation.baseTotalBeforeVat),
      },
    ];
  }

  return [
    costWithCoefficientRow(calculation),
    {
      label: `Налог ${calculation.profitTaxRate}%`,
      value: fmtMoney(calculation.profitTaxAmount),
    },
    {
      label: "Подрядные работы",
      value: fmtMoney(calculation.contractorWorkTotal),
    },
    {
      label: "Дополнительные работы",
      value: fmtMoney(calculation.additionalWorkTotal),
    },
    {
      label: "База без РЭТРО",
      value: fmtMoney(calculation.baseTotalBeforeVat),
    },
  ];
}

export function profitTaxRows(
  calculation: TkpCommercialCalculation,
): FormulaRow[] {
  if (calculation.priceMode === "coefficient") {
    return [
      costWithCoefficientRow(calculation),
      { label: "Ставка налога", value: `${calculation.profitTaxRate}/94` },
      {
        label: `Налог ${calculation.profitTaxRate}%`,
        value: fmtMoney(calculation.profitTaxAmount),
      },
    ];
  }

  return [
    {
      label: "База без РЭТРО",
      value: fmtMoney(calculation.baseTotalBeforeVat),
    },
    {
      label: "Подрядные работы",
      value: fmtMoney(calculation.contractorWorkTotal),
    },
    {
      label: "Дополнительные работы",
      value: fmtMoney(calculation.additionalWorkTotal),
    },
    { label: "Ставка налога", value: formatPercent(calculation.profitTaxRate) },
    {
      label: `Налог ${calculation.profitTaxRate}%`,
      value: fmtMoney(calculation.profitTaxAmount),
    },
  ];
}

export function totalBeforeVatRows(
  calculation: TkpCommercialCalculation,
): FormulaRow[] {
  return [
    {
      label: "База без РЭТРО",
      value: fmtMoney(calculation.baseTotalBeforeVat),
    },
    {
      label: "РЭТРО с коэффициентом 1,2",
      value: fmtMoney(calculation.retroWithFactor),
    },
    { label: "Цена без НДС", value: fmtMoney(calculation.totalBeforeVat) },
  ];
}

export function netProfitRows(
  calculation: TkpCommercialCalculation,
): FormulaRow[] {
  return [
    { label: "Цена без НДС", value: fmtMoney(calculation.totalBeforeVat) },
    {
      label: "Базовая себестоимость",
      value: fmtMoney(calculation.costWithFixed),
    },
    {
      label: `Налог ${calculation.profitTaxRate}%`,
      value: fmtMoney(calculation.profitTaxAmount),
    },
    {
      label: "Подрядные работы по договорам",
      value: fmtMoney(calculation.contractorWorkBase),
    },
    {
      label: "Дополнительные работы по договорам",
      value: fmtMoney(calculation.additionalWorkBase),
    },
    { label: "Чистая прибыль", value: fmtMoney(calculation.netProfit) },
  ];
}
