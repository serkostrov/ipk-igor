import { useState } from "react";
import {
  PaymentCalendarPage as Calendar,
  type ReceiptDraft,
} from "@/features/hardcode/payment-calendar";
import { EntityRecordDialog } from "@/pages/entity/ui/EntityRecordDialog";

export function PaymentCalendarPage({
  onOpenRecord,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  return (
    <>
      <Calendar onOpenRecord={onOpenRecord} onCreateReceipt={setDraft} />
      {draft && (
        <EntityRecordDialog
          open
          entity={draft.entity}
          presetValues={draft.values}
          presetPlanLinks={draft.links}
          titleOverride="Оформить поступление"
          onOpenRelation={onOpenRecord}
          onOpenChange={(open) => {
            if (!open) setDraft(null);
          }}
        />
      )}
    </>
  );
}
