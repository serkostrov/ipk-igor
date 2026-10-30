/**
 * Commercial TKP price formula v7 — ported from ipk-new
 * `review-commercial-calculation.server.ts` (full-precision path).
 */

import {
  PreciseDecimal,
  sumPreciseDecimals,
} from "@/shared/lib/precise-decimal";
import type { ReviewGipCommercialBasis } from "../../tkp-gip-cost/model/gip-cost";

export const TKP_SALE_PRICE_MODES = ["coefficient", "manual"] as const;
export type TkpSalePriceMode = (typeof TKP_SALE_PRICE_MODES)[number];

export const TKP_COMMERCIAL_FORMULA_VERSION = "tkp-commercial-v7" as const;
export const TKP_COMMERCIAL_RETRO_FACTOR = 1.2 as const;
export const TKP_COMMERCIAL_PROFIT_TAX_RATE = 6 as const;
export const TKP_COMMERCIAL_VAT_RATE = 22 as const;
export const TKP_COMMERCIAL_MAX_MONEY = 999_999_999_999.99;
const MAX_COEFFICIENT = PreciseDecimal.from(1000);

export type TkpCommercialPriceFields =
  | { mode: "coefficient"; saleCoefficient: number; retroAmount?: number }
  | { mode: "manual"; manualTotalBeforeVat: number; retroAmount?: number };

export type TkpCommercialInput = TkpCommercialPriceFields & {
  basis: ReviewGipCommercialBasis;
};

export type TkpCommercialCalculation = {
  calculationVersion: 7;
  formulaVersion: typeof TKP_COMMERCIAL_FORMULA_VERSION;
  priceMode: TkpSalePriceMode;
  inputCoefficient: number | null;
  manualTotalBeforeVat: number | null;
  effectiveCoefficient: number;
  commercialCoefficient: number;
  costWithFixed: number;
  costWithCoefficient: number;
  profitTaxRate: typeof TKP_COMMERCIAL_PROFIT_TAX_RATE;
  profitTaxAmount: number;
  contractorWorkTotal: number;
  additionalWorkTotal: number;
  contractorWorkBase: number;
  additionalWorkBase: number;
  baseTotalBeforeVat: number;
  retroAmount: number;
  retroFactor: typeof TKP_COMMERCIAL_RETRO_FACTOR;
  retroWithFactor: number;
  netProfit: number;
  profitabilityPercent: number;
  totalBeforeVat: number;
  vatRate: typeof TKP_COMMERCIAL_VAT_RATE;
  vatAmount: number;
  totalWithVat: number;
};

function requireNonNeg(value: number, label: string): PreciseDecimal {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
  const decimal = PreciseDecimal.from(value);
  if (decimal.toRoundedNumber(2) > TKP_COMMERCIAL_MAX_MONEY) {
    throw new Error(`${label} is too large`);
  }
  return decimal;
}

export function calculateTkpCommercialV7(
  input: TkpCommercialInput,
): TkpCommercialCalculation {
  const basis = input.basis;
  const rawCostWithFixed = basis.raw
    ? PreciseDecimal.from(basis.raw.costWithFixed)
    : requireNonNeg(basis.costWithFixed, "Cost with fixed");
  const rawContractorWorkTotal = basis.raw
    ? PreciseDecimal.from(basis.raw.contractorWorkTotal)
    : requireNonNeg(basis.contractorWorkTotal, "Contractor work");
  const rawAdditionalWorkTotal = basis.raw
    ? PreciseDecimal.from(basis.raw.additionalWorkTotal)
    : requireNonNeg(basis.additionalWorkTotal, "Additional work");
  const rawContractorWorkBase = basis.raw?.contractorWorkBase
    ? PreciseDecimal.from(basis.raw.contractorWorkBase)
    : requireNonNeg(
        basis.contractorWorkBase ?? basis.contractorWorkTotal,
        "Contractor base",
      );
  const rawAdditionalWorkBase = basis.raw?.additionalWorkBase
    ? PreciseDecimal.from(basis.raw.additionalWorkBase)
    : requireNonNeg(
        basis.additionalWorkBase ?? basis.additionalWorkTotal,
        "Additional base",
      );

  if (!rawCostWithFixed.isPositive()) {
    throw new Error("Себестоимость с FIX должна быть больше нуля");
  }

  const retroAmount = requireNonNeg(
    input.retroAmount ?? 0,
    "RETRO",
  ).toRoundedNumber(2);
  const rawRetroAmount = PreciseDecimal.from(retroAmount);
  const rawRetroWithFactor = rawRetroAmount.multiply(
    PreciseDecimal.from(TKP_COMMERCIAL_RETRO_FACTOR),
  );

  let inputCoefficient: number | null;
  let manualTotalBeforeVat: number | null;
  let effectiveCoefficient: number;
  let rawCostWithCoefficient: PreciseDecimal;
  let rawProfitTaxAmount: PreciseDecimal;
  let rawBaseTotalBeforeVat: PreciseDecimal;

  if (input.mode === "coefficient") {
    inputCoefficient = PreciseDecimal.from(
      input.saleCoefficient,
    ).toRoundedNumber(4);
    const coefficient = PreciseDecimal.from(inputCoefficient);
    if (!coefficient.isPositive() || coefficient.compare(MAX_COEFFICIENT) > 0) {
      throw new Error("Коэффициент вне допустимого диапазона");
    }
    manualTotalBeforeVat = null;
    effectiveCoefficient = inputCoefficient;
    rawCostWithCoefficient = rawCostWithFixed.multiply(coefficient);
    if (!rawCostWithCoefficient.isPositive()) {
      throw new Error("Коэффициент должен давать положительную цену");
    }
    rawProfitTaxAmount = rawCostWithCoefficient
      .multiply(PreciseDecimal.from(TKP_COMMERCIAL_PROFIT_TAX_RATE))
      .divide(PreciseDecimal.from(94));
    rawBaseTotalBeforeVat = sumPreciseDecimals([
      rawCostWithCoefficient,
      rawProfitTaxAmount,
      rawContractorWorkTotal,
      rawAdditionalWorkTotal,
    ]);
  } else {
    inputCoefficient = null;
    manualTotalBeforeVat = PreciseDecimal.from(
      input.manualTotalBeforeVat,
    ).toRoundedNumber(2);
    rawBaseTotalBeforeVat = PreciseDecimal.from(manualTotalBeforeVat);
    if (!rawBaseTotalBeforeVat.isPositive()) {
      throw new Error("Ручная цена без НДС должна быть больше нуля");
    }
    const rawExtraTotal = rawContractorWorkTotal.add(rawAdditionalWorkTotal);
    if (rawBaseTotalBeforeVat.compare(rawExtraTotal) <= 0) {
      throw new Error("Ручная цена должна превышать подрядные позиции");
    }
    const rawTaxableGross = rawBaseTotalBeforeVat.subtract(rawExtraTotal);
    rawProfitTaxAmount = rawTaxableGross
      .multiply(PreciseDecimal.from(TKP_COMMERCIAL_PROFIT_TAX_RATE))
      .divide(PreciseDecimal.from(100));
    rawCostWithCoefficient = rawTaxableGross.subtract(rawProfitTaxAmount);
    effectiveCoefficient = rawCostWithCoefficient
      .divide(rawCostWithFixed)
      .toRoundedNumber(4);
    const coefficient = PreciseDecimal.from(effectiveCoefficient);
    if (!coefficient.isPositive() || coefficient.compare(MAX_COEFFICIENT) > 0) {
      throw new Error("Ручная цена даёт недопустимый эффективный коэффициент");
    }
  }

  const rawTotalBeforeVat = rawBaseTotalBeforeVat.add(rawRetroWithFactor);
  const rawNetProfit = rawTotalBeforeVat
    .subtract(rawCostWithFixed)
    .subtract(rawProfitTaxAmount)
    .subtract(rawContractorWorkBase)
    .subtract(rawAdditionalWorkBase);
  const profitabilityPercent = rawNetProfit
    .divide(rawTotalBeforeVat)
    .multiply(PreciseDecimal.from(100))
    .toRoundedNumber(2);
  const rawVatAmount = rawTotalBeforeVat
    .multiply(PreciseDecimal.from(TKP_COMMERCIAL_VAT_RATE))
    .divide(PreciseDecimal.from(100));
  const rawTotalWithVat = rawTotalBeforeVat.add(rawVatAmount);

  return {
    calculationVersion: 7,
    formulaVersion: TKP_COMMERCIAL_FORMULA_VERSION,
    priceMode: input.mode,
    inputCoefficient,
    manualTotalBeforeVat,
    effectiveCoefficient,
    commercialCoefficient: effectiveCoefficient,
    costWithFixed: rawCostWithFixed.toRoundedNumber(2),
    costWithCoefficient: rawCostWithCoefficient.toRoundedNumber(2),
    profitTaxRate: TKP_COMMERCIAL_PROFIT_TAX_RATE,
    profitTaxAmount: rawProfitTaxAmount.toRoundedNumber(2),
    contractorWorkTotal: rawContractorWorkTotal.toRoundedNumber(2),
    additionalWorkTotal: rawAdditionalWorkTotal.toRoundedNumber(2),
    contractorWorkBase: rawContractorWorkBase.toRoundedNumber(2),
    additionalWorkBase: rawAdditionalWorkBase.toRoundedNumber(2),
    baseTotalBeforeVat: rawBaseTotalBeforeVat.toRoundedNumber(2),
    retroAmount,
    retroFactor: TKP_COMMERCIAL_RETRO_FACTOR,
    retroWithFactor: rawRetroWithFactor.toRoundedNumber(2),
    netProfit: rawNetProfit.toRoundedNumber(2),
    profitabilityPercent,
    totalBeforeVat: rawTotalBeforeVat.toRoundedNumber(2),
    vatRate: TKP_COMMERCIAL_VAT_RATE,
    vatAmount: rawVatAmount.toRoundedNumber(2),
    totalWithVat: rawTotalWithVat.toRoundedNumber(2),
  };
}

export function tkpSalePriceModeLabel(mode: TkpSalePriceMode) {
  return mode === "coefficient" ? "Коэффициент к себестоимости" : "Ручная цена";
}
