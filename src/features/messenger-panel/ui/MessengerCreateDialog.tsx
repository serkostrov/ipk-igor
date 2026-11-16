import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useEntityConfig } from "@/entities/entity";
import {
  createMessengerGroup,
  filterMessengerUserOptions,
  listMessengerUserOptions,
  openOrCreateDirectChat,
} from "@/entities/messenger";
import { useSessionUser } from "@/entities/session";
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

export function MessengerCreateDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "direct" | "group";
}) {
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const options = useMemo(() => {
    const exclude = new Set(
      sessionUser?.id ? [sessionUser.id] : ([] as string[]),
    );
    return filterMessengerUserOptions(
      listMessengerUserOptions(entities, exclude),
      query,
    );
  }, [entities, query, sessionUser]);

  function toggleUser(authUserId: string) {
    if (mode === "direct") {
      setSelected([authUserId]);
      return;
    }
    setSelected((current) =>
      current.includes(authUserId)
        ? current.filter((id) => id !== authUserId)
        : [...current, authUserId],
    );
  }

  async function handleSubmit() {
    setBusy(true);
    try {
      if (mode === "direct") {
        const other = selected[0];
        if (!other) {
          toast.error("Выберите пользователя");
          return;
        }
        await openOrCreateDirectChat(other);
      } else {
        if (selected.length < 2) {
          toast.error("Выберите минимум двух участников");
          return;
        }
        await createMessengerGroup({
          title: title.trim() || "Групповой чат",
          memberIds: selected,
        });
      }
      onOpenChange(false);
      setQuery("");
      setTitle("");
      setSelected([]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось создать чат",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>
            {mode === "direct" ? "Новый чат" : "Групповой чат"}
          </DialogTitle>
          <DialogDescription>
            {mode === "direct"
              ? "Выберите сотрудника для персональной переписки"
              : "Укажите название и минимум двух участников (вы — третий)"}
          </DialogDescription>
        </DialogHeader>

        {mode === "group" ? (
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Название группы"
            autoFocus
          />
        ) : null}

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по ФИО"
          autoFocus={mode === "direct"}
        />

        <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
          {options.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Никого не найдено
            </p>
          ) : (
            options.map((user) => {
              const active = selected.includes(user.authUserId);
              return (
                <button
                  key={user.authUserId}
                  type="button"
                  onClick={() => toggleUser(user.authUserId)}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted/60",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                </button>
              );
            })
          )}
        </div>

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
            onClick={() => void handleSubmit()}
            disabled={busy}
          >
            {mode === "direct" ? "Открыть" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
