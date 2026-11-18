import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  findTkpLeadRelationField,
  getEntityRelationTargetId,
  parseEntityRelationIds,
  updateEntityRecord,
  useEntityConfig,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { readTkpApprovalState } from "../lib/tkp-approval";
import {
  assertTkpSendToCustomer,
  buildTkpSendToCustomerPatch,
  resolveLeadCustomerApprovalOptionId,
  TKP_SEND_REVISION_KEY,
} from "../lib/assert-tkp-send-to-customer";

/**
 * Manager fixes send-to-customer after full approval chain.
 * `fullyApproved` comes from automation config / soft progress until
 * decision history is stored on the revision.
 */
export function TkpSendToCustomerPanel({
  entity,
  record,
  revisionId,
  fullyApproved = false,
  readOnly = false,
}: {
  entity: Entity;
  record: EntityRecord;
  revisionId?: string | null;
  fullyApproved?: boolean;
  readOnly?: boolean;
}) {
  const { entities } = useEntityConfig();
  const live =
    entities
      .find((item) => item.id === entity.id)
      ?.records.find((item) => item.id === record.id) ?? record;
  const approval = readTkpApprovalState(live.values);
  const effectiveRevisionId = revisionId?.trim() || approval.revisionId || "";
  const alreadySent =
    (live.values[TKP_SEND_REVISION_KEY] ?? "").trim() === effectiveRevisionId &&
    Boolean(effectiveRevisionId);

  const [sentAt, setSentAt] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [nextCallAt, setNextCallAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);

  if (readOnly) return null;

  async function handleSubmit() {
    if (!effectiveRevisionId) {
      toast.warning("Нет согласованной ревизии ТКП");
      return;
    }
    setBusy(true);
    try {
      assertTkpSendToCustomer({
        entity,
        record: live,
        entities,
        revisionId: effectiveRevisionId,
        sentAt: new Date(sentAt).toISOString(),
        nextCallAt: new Date(nextCallAt).toISOString(),
        fullyApproved,
      });

      const patch = buildTkpSendToCustomerPatch({
        revisionId: effectiveRevisionId,
        sentAt: new Date(sentAt).toISOString(),
        nextCallAt: new Date(nextCallAt).toISOString(),
      });
      await updateEntityRecord(entity.id, live.id, patch);

      const leadField = findTkpLeadRelationField(entity, entities);
      const leadEntityId = leadField
        ? getEntityRelationTargetId(leadField)
        : null;
      const leadId = leadField
        ? parseEntityRelationIds(live.values[leadField.id])[0]
        : null;
      const leadEntity = leadEntityId
        ? entities.find((item) => item.id === leadEntityId)
        : null;
      if (leadEntity && leadId && leadField) {
        // Prefer process trigger field named «Стадия» / «Статус».
        const stageField =
          leadEntity.fields.find((field) => {
            const name = field.name.trim().toLocaleLowerCase("ru");
            return (
              field.type === "list" && (name === "стадия" || name === "статус")
            );
          }) ?? null;
        if (stageField) {
          const optionId = resolveLeadCustomerApprovalOptionId(
            leadEntity,
            stageField.id,
          );
          if (optionId) {
            await updateEntityRecord(leadEntity.id, leadId, {
              [stageField.id]: optionId,
            });
          }
        }
      }

      toast.success("Отправка заказчику зафиксирована");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось зафиксировать отправку",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">Отправка ТКП заказчику</p>
        <p className="text-xs text-muted-foreground">
          Доступно после согласования ГИПом, руководителем коммерции и
          гендиректором.
        </p>
      </div>
      {alreadySent ? (
        <p className="text-sm text-muted-foreground">
          Отправка этой версии уже зафиксирована.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs">
            Дата отправки
            <Input
              type="date"
              value={sentAt}
              onChange={(event) => setSentAt(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Дата следующего звонка
            <Input
              type="date"
              value={nextCallAt}
              onChange={(event) => setNextCallAt(event.target.value)}
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={busy || !fullyApproved || !effectiveRevisionId}
            onClick={() => void handleSubmit()}
          >
            Зафиксировать отправку
          </Button>
          {!fullyApproved ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Цепочка согласования ещё не завершена (нужны 12.1–12.3).
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
