import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { useSessionUser } from "@/entities/session";
import type { Entity, EntityRecord } from "@/entities/entity";
import {
  isTkpMissingSourceLocked,
  parseTkpMissingSourceData,
  saveTkpMissingSourceData,
  type TkpMissingSourceEntry,
} from "../model/missing-source-data";

/**
 * Optional block for department calc task / related row:
 * list missing source data; locked after first submit.
 */
export function TkpMissingSourceAsk({
  entity,
  record,
  readOnly = false,
}: {
  entity: Entity;
  record: EntityRecord;
  readOnly?: boolean;
}) {
  const sessionUser = useSessionUser();
  const locked = isTkpMissingSourceLocked(record.values);
  const initial = useMemo(
    () => parseTkpMissingSourceData(record.values),
    [record.values],
  );
  const [text, setText] = useState(
    () => initial.map((item) => item.text).join("\n") || "",
  );
  const [busy, setBusy] = useState(false);

  async function handleSave(lock: boolean) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const entries: TkpMissingSourceEntry[] = lines.map((line) => ({
      id: crypto.randomUUID(),
      text: line,
      submittedAt: new Date().toISOString(),
      submittedByUserId: sessionUser?.id ?? null,
    }));
    setBusy(true);
    try {
      await saveTkpMissingSourceData({
        entity,
        record,
        entries,
        lock,
        actorUserId: sessionUser?.id ?? null,
      });
      toast.success(
        lock
          ? "Недостающие данные сохранены и зафиксированы"
          : "Черновик недостающих данных сохранён",
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium">Недостающие исходные данные</p>
        <p className="text-xs text-muted-foreground">
          {locked
            ? "Список зафиксирован после отправки и больше не редактируется."
            : "По одной позиции на строку. После отправки список нельзя изменить."}
        </p>
      </div>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        readOnly={readOnly || locked}
        rows={4}
        className="min-h-20 text-sm"
        placeholder="Например: нет геодезии по объекту…"
      />
      {!readOnly && !locked ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleSave(false)}
          >
            Сохранить черновик
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !text.trim()}
            onClick={() => void handleSave(true)}
          >
            Отправить список
          </Button>
        </div>
      ) : null}
    </div>
  );
}
