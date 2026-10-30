import type { TkpCommercialCalculation, TkpSalePriceMode } from "./commercial";

/** Lightweight revision summary for pricing history UI (persistence wired separately). */
export type TkpPriceRevisionSummary = {
  id: string;
  revisionNumber: number | null;
  createdAt: string;
  createdByName: string | null;
  priceMode: TkpSalePriceMode;
  /** Seed values for the editor when this is the latest revision. */
  saleCoefficient?: number | null;
  manualTotalBeforeVat?: number | null;
  retroAmount?: number | null;
  calculation: TkpCommercialCalculation | null;
};
