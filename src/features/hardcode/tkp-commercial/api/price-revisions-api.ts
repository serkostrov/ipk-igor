import { supabase } from "@/shared/api/supabase";
import type { ReviewGipCostCalculation } from "../../tkp-gip-cost/model/gip-cost";
import type {
  TkpCommercialCalculation,
  TkpSalePriceMode,
} from "../model/commercial";
import type { TkpPriceRevisionSummary } from "../model/types";

type TkpPriceRevisionRow = {
  id: string;
  entity_id: string;
  record_id: string;
  revision_number: number;
  price_mode: TkpSalePriceMode;
  sale_coefficient: number | null;
  manual_total_before_vat: number | null;
  retro_amount: number | null;
  calculation_snapshot: TkpCommercialCalculation | null;
  gip_calculation_snapshot: ReviewGipCostCalculation | null;
  created_by_name: string | null;
  created_at: string;
};

function requireClient() {
  if (!supabase) {
    throw new Error("Supabase не настроен");
  }
  return supabase;
}

function mapRow(row: TkpPriceRevisionRow): TkpPriceRevisionSummary {
  return {
    id: row.id,
    revisionNumber: row.revision_number,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    priceMode: row.price_mode,
    saleCoefficient: row.sale_coefficient,
    manualTotalBeforeVat: row.manual_total_before_vat,
    retroAmount: row.retro_amount,
    calculation: row.calculation_snapshot,
  };
}

export async function fetchTkpPriceRevisions(
  entityId: string,
  recordId: string,
): Promise<TkpPriceRevisionSummary[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("tkp_price_revisions")
    .select(
      "id, entity_id, record_id, revision_number, price_mode, sale_coefficient, manual_total_before_vat, retro_amount, calculation_snapshot, gip_calculation_snapshot, created_by_name, created_at",
    )
    .eq("entity_id", entityId)
    .eq("record_id", recordId)
    .order("revision_number", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as TkpPriceRevisionRow[]).map(mapRow);
}

export type AppendTkpPriceRevisionInput = {
  entityId: string;
  recordId: string;
  priceMode: TkpSalePriceMode;
  saleCoefficient?: number | null;
  manualTotalBeforeVat?: number | null;
  retroAmount?: number;
  calculation: TkpCommercialCalculation;
  gipCalculation?: ReviewGipCostCalculation | null;
  idempotencyKey?: string | null;
  createdByName?: string | null;
};

export async function appendTkpPriceRevision(
  input: AppendTkpPriceRevisionInput,
): Promise<TkpPriceRevisionSummary> {
  const client = requireClient();
  const { data, error } = await client.rpc("append_tkp_price_revision", {
    p_entity_id: input.entityId,
    p_record_id: input.recordId,
    p_price_mode: input.priceMode,
    p_sale_coefficient: input.saleCoefficient ?? null,
    p_manual_total_before_vat: input.manualTotalBeforeVat ?? null,
    p_retro_amount: input.retroAmount ?? 0,
    p_calculation_snapshot: input.calculation,
    p_gip_calculation_snapshot: input.gipCalculation ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_created_by_name: input.createdByName ?? null,
  });

  if (error) throw error;
  const row = data as TkpPriceRevisionRow;
  return mapRow(row);
}
