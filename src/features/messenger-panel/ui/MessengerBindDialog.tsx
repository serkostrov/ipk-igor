import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  bindMessengerEntity,
  formatMessengerCrmChatTitle,
  isMessengerCrmEntity,
} from "@/entities/messenger";
import { resolveRelationRecordLabel, useEntityConfig } from "@/entities/entity";
import { parsePath } from "@/shared/lib/navigation";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

export function MessengerBindDialog({
  open,
  onOpenChange,
  chatId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
}) {
  const { entities } = useEntityConfig();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);

  const crmEntities = useMemo(
    () => entities.filter((entity) => isMessengerCrmEntity(entity)),
    [entities],
  );

  async function handleBind() {
    const trimmed = path.trim();
    let entityId = "";
    let recordId = "";
    try {
      const url = trimmed.startsWith("http")
        ? new URL(trimmed).pathname
        : trimmed;
      const location = parsePath(url.startsWith("/") ? url : `/${url}`);
      if (location?.type === "record") {
        entityId = location.entityId;
        recordId = location.recordId;
      }
    } catch {
      // fall through
    }
    if (!entityId || !recordId) {
      toast.error("Вставьте ссылку на карточку CRM (/e/…/r/…)");
      return;
    }
    const entity = crmEntities.find((item) => item.id === entityId);
    if (!entity) {
      toast.error("Эта сущность не поддерживает привязку чата");
      return;
    }
    const title = formatMessengerCrmChatTitle(
      entity,
      resolveRelationRecordLabel(entity, recordId)?.trim() ||
        recordId.slice(0, 8),
    );
    setBusy(true);
    try {
      await bindMessengerEntity(chatId, entityId, recordId, title);
      onOpenChange(false);
      setPath("");
      toast.success("Чат привязан");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось привязать чат",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>Привязать к CRM</DialogTitle>
          <DialogDescription>
            Вставьте ссылку на лид, сделку, проект, договор или ТКП.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="/e/…/r/…"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Отмена
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleBind()}
          >
            Привязать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
