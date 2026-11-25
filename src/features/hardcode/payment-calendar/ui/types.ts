import type { CalendarReceipt, PaymentRow } from "../model/types";

export type OpenRecord = (entityId: string, recordId: string) => void;

export type PaymentTableProps = {
  rows: readonly PaymentRow[];
  receiptsById: ReadonlyMap<string, CalendarReceipt>;
  stageEntityId: string | undefined;
  ddsEntityId: string | undefined;
  onOpenRecord?: OpenRecord;
};
