import { isSupabaseConfigured, supabase } from "@/shared/api/supabase";
import type { PaymentAllocation, PaymentKind } from "../model/types";

type AllocationRow = {
  id: string;
  dds_record_id: string;
  stage_id: string;
  part_kind: PaymentKind;
  amount: number | string;
};

export type PaymentAllocationInput = {
  stageId: string;
  partKind: PaymentKind;
  amount: number;
};

const PAGE_SIZE = 1000;

function toAllocation(row: AllocationRow): PaymentAllocation {
  return {
    id: row.id,
    ddsRecordId: row.dds_record_id,
    stageId: row.stage_id,
    partKind: row.part_kind,
    amount: Number(row.amount),
  };
}

/** The migration is not applied yet: PostgREST cannot find the table. */
function isMissingTable(error: { code?: string } | null) {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/** All manual links «операция ДДС → плановый платёж». */
export async function fetchPaymentAllocations(): Promise<PaymentAllocation[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const out: PaymentAllocation[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("payment_allocations")
      .select("id, dds_record_id, stage_id, part_kind, amount")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (isMissingTable(error)) return [];
      throw error;
    }
    const page = (data ?? []) as AllocationRow[];
    out.push(...page.map(toAllocation));
    if (page.length < PAGE_SIZE) return out;
  }
}

/** Replaces the whole set of links of one operation (validated in the DB). */
export async function replacePaymentAllocations(
  ddsRecordId: string,
  operationAmount: number | null,
  items: readonly PaymentAllocationInput[],
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.rpc("replace_payment_allocations", {
    p_dds_record_id: ddsRecordId,
    p_operation_amount: operationAmount,
    p_allocations: items.map((item) => ({
      stageId: item.stageId,
      partKind: item.partKind,
      amount: item.amount,
    })),
  });
  if (error) {
    if (isMissingTable(error) || error.code === "PGRST202") {
      throw new Error(
        "Привязка к плановым платежам недоступна: на сервере не применена миграция payment_allocations.",
      );
    }
    throw error;
  }
}
