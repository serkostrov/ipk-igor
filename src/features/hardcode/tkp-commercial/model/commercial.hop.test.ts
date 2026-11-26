/**
 * Commercial TKP net-profit formula (TZ 25.11).
 * Run: npx --yes vite-node src/features/hardcode/tkp-commercial/model/commercial.hop.test.ts
 */
import {
  calculateTkpCommercialV7,
  type TkpCommercialInput,
} from "./commercial";
import type { ReviewGipCommercialBasis } from "../../tkp-gip-cost/model/gip-cost";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function almostEqual(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

const basis: ReviewGipCommercialBasis = {
  costWithFixed: 100_000,
  contractorWorkTotal: 24_000,
  additionalWorkTotal: 0,
  contractorWorkBase: 20_000,
  additionalWorkBase: 0,
  raw: {
    costWithFixed: "100000",
    contractorWorkTotal: "24000",
    additionalWorkTotal: "0",
    contractorWorkBase: "20000",
    additionalWorkBase: "0",
  },
};

const coeffInput: TkpCommercialInput = {
  mode: "coefficient",
  saleCoefficient: 1.5,
  basis,
};

const result = calculateTkpCommercialV7(coeffInput);

// costWithCoefficient = 100000 * 1.5 = 150000
// profitTax = 150000 * 6 / 94 ≈ 9574.47
// baseTotal = 150000 + 9574.47 + 24000 = 183574.47
// totalBeforeVat = same (no retro)
// ЧП = total − costWithFixed − tax − contractorTotal(with coeff)
const expectedNet =
  result.totalBeforeVat -
  result.costWithFixed -
  result.profitTaxAmount -
  result.contractorWorkTotal -
  result.additionalWorkTotal;

assert(
  almostEqual(result.netProfit, expectedNet),
  `netProfit ${result.netProfit} != ${expectedNet}`,
);
assert(
  result.netProfit <
    result.totalBeforeVat -
      result.costWithFixed -
      result.profitTaxAmount -
      result.contractorWorkBase,
  "ЧП with coeff must be lower than ЧП with base-only deduction",
);

const manual = calculateTkpCommercialV7({
  mode: "manual",
  manualTotalBeforeVat: 200_000,
  basis,
});
const manualExpected =
  manual.totalBeforeVat -
  manual.costWithFixed -
  manual.profitTaxAmount -
  manual.contractorWorkTotal -
  manual.additionalWorkTotal;
assert(
  almostEqual(manual.netProfit, manualExpected),
  `manual netProfit ${manual.netProfit} != ${manualExpected}`,
);

console.log("commercial.hop.test.ts: ok", {
  coeffNet: result.netProfit,
  manualNet: manual.netProfit,
});
