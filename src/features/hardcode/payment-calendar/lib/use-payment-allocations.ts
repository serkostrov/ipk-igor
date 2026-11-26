import { useSyncExternalStore } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import {
  fetchPaymentAllocations,
  replacePaymentAllocations,
  type PaymentAllocationInput,
} from "../api/allocations-api";

const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getVersion() {
  return version;
}

/** Re-read allocations in every mounted calendar view. */
function bumpAllocations() {
  version += 1;
  for (const listener of listeners) listener();
}

/** Manual operation → planned payment links; re-read after every save. */
export function usePaymentAllocations() {
  const current = useSyncExternalStore(subscribe, getVersion, getVersion);
  // `current` is not read by the fetch: it only re-runs it after a save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useAsyncValue(() => fetchPaymentAllocations(), [current]);
}

/** DB first; calendar views refresh once the server accepted the links. */
export async function savePaymentAllocations(
  ddsRecordId: string,
  operationAmount: number | null,
  items: readonly PaymentAllocationInput[],
): Promise<void> {
  await replacePaymentAllocations(ddsRecordId, operationAmount, items);
  bumpAllocations();
}
