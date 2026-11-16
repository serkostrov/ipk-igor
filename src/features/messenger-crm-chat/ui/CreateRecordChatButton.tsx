import { useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  filterMessengerUserOptions,
  formatMessengerCrmChatTitle,
  isMessengerCrmEntity,
  listMessengerUserOptions,
  openOrCreateCrmChat,
  selectMessengerChat,
  useMessengerChats,
} from "@/entities/messenger";
import {
  resolveRelationRecordLabel,
  useEntityConfig,
  type Entity,
  type EntityRecord,
} from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { useAppNavigate } from "@/shared/lib/navigation";
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
import { cn } from "@/shared/lib/cn";

function recordTitle(entity: Entity, record: EntityRecord): string {
  return (
    resolveRelationRecordLabel(entity, record.id)?.trim() ||
    record.id.slice(0, 8)
  );
}

export function CreateRecordChatButton({
  entity,
  record,
  className,
}: {
  entity: Entity;
  record: EntityRecord;
  className?: string;
}) {
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const { go } = useAppNavigate();
  const chats = useMessengerChats();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const eligible = isMessengerCrmEntity(entity);

  const existing = useMemo(
    () =>
      chats.find(
        (chat) =>
          chat.entityId === entity.id &&
          chat.recordId === record.id &&
          chat.status !== "deleted",
      ),
    [chats, entity.id, record.id],
  );

  const title = formatMessengerCrmChatTitle(
    entity,
    recordTitle(entity, record),
  );

  const options = useMemo(() => {
    const exclude = new Set(
      sessionUser?.id ? [sessionUser.id] : ([] as string[]),
    );
    return filterMessengerUserOptions(
      listMessengerUserOptions(entities, exclude),
      query,
    );
  }, [entities, query, sessionUser]);

  if (!eligible) return null;

  async function handleOpenExisting() {
    if (!existing) return;
    await selectMessengerChat(existing.id);
    go({ type: "chats" });
  }

  async function handleCreate() {
    setBusy(true);
    try {
      await openOrCreateCrmChat({
        entityId: entity.id,
        recordId: record.id,
        entityTitle: title,
        memberIds: selected,
      });
      setOpen(false);
      setSelected([]);
      setQuery("");
      go({ type: "chats" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось создать чат",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn("h-8 gap-1.5 text-xs", className)}
        onClick={() => {
          if (existing) {
            void handleOpenExisting();
            return;
          }
          setOpen(true);
        }}
      >
        <MessageCircle className="size-3.5" />
        {existing ? "Открыть чат" : "Создать чат"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md gap-4">
          <DialogHeader>
            <DialogTitle>Чат по записи</DialogTitle>
            <DialogDescription>
              Будет создан чат «{title}». Выберите участников.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск сотрудников"
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {options.map((user) => {
              const active = selected.includes(user.authUserId);
              return (
                <button
                  key={user.authUserId}
                  type="button"
                  onClick={() =>
                    setSelected((current) =>
                      current.includes(user.authUserId)
                        ? current.filter((id) => id !== user.authUserId)
                        : [...current, user.authUserId],
                    )
                  }
                  className={cn(
                    "flex w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/60",
                  )}
                >
                  {user.name}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={() => void handleCreate()}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
