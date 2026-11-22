import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getSystemUserNameByAuthId, useEntityConfig } from "@/entities/entity";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import {
  addMessengerMembers,
  filterMessengerUserOptions,
  listMessengerUserOptions,
  removeMessengerMember,
  setMessengerAdmin,
  useMessengerMembers,
  type MessengerChatKind,
  type MessengerUserOption,
} from "@/entities/messenger";

const EMPTY_MESSENGER_USER_OPTIONS: MessengerUserOption[] = [];
import { useSessionUser } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";

export function MessengerParticipantsDialog({
  open,
  onOpenChange,
  chatId,
  isAdmin,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  isAdmin: boolean;
  kind: MessengerChatKind;
}) {
  const members = useMessengerMembers();
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const memberIds = useMemo(
    () => new Set(members.map((item) => item.userId)),
    [members],
  );

  const userOptions = useAsyncValue(
    () => listMessengerUserOptions(entities, memberIds),
    [entities, memberIds],
  );
  const candidates = useMemo(() => {
    const base =
      userOptions.status === "ready"
        ? userOptions.value
        : EMPTY_MESSENGER_USER_OPTIONS;
    return filterMessengerUserOptions(base, query);
  }, [userOptions, query]);

  async function handleAdd(authUserId: string) {
    setBusy(true);
    try {
      await addMessengerMembers(chatId, [authUserId]);
      setQuery("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось добавить участника",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>Участники</DialogTitle>
        </DialogHeader>

        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {members.map((member) => {
            const name =
              getSystemUserNameByAuthId(entities, member.userId) ??
              member.userId.slice(0, 8);
            const isSelf = member.userId === sessionUser?.id;
            return (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {name}
                  {member.role === "admin" ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      админ
                    </span>
                  ) : null}
                </span>
                {kind === "group" && isAdmin && !isSelf ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => {
                        void setMessengerAdmin(
                          chatId,
                          member.userId,
                          member.role !== "admin",
                        ).catch((error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Не удалось изменить роль",
                          ),
                        );
                      }}
                    >
                      {member.role === "admin" ? "Снять админ" : "Админ"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive"
                      disabled={busy}
                      onClick={() => {
                        void removeMessengerMember(chatId, member.userId).catch(
                          (error: unknown) =>
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Не удалось удалить участника",
                            ),
                        );
                      }}
                    >
                      Удалить
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {kind === "group" ? (
          <div className="space-y-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Добавить участника…"
            />
            <div className="max-h-36 overflow-y-auto rounded-lg border border-border">
              {candidates.slice(0, 20).map((user) => (
                <button
                  key={user.authUserId}
                  type="button"
                  disabled={busy}
                  className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/60"
                  onClick={() => void handleAdd(user.authUserId)}
                >
                  <span className="truncate">{user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Добавить
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
