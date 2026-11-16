import { useMemo, useState } from "react";
import { Archive, Paperclip, Pin, Users } from "lucide-react";
import {
  filterMessengerChats,
  selectMessengerChat,
  setShowArchivedChats,
  useMessengerChats,
  useShowArchivedChats,
  type MessengerChat,
} from "@/entities/messenger";
import { getSystemUserNameByAuthId, useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { getPersonInitials } from "@/shared/lib/person";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/lib/cn";

function chatDisplayTitle(
  chat: MessengerChat,
  resolveName: (userId: string) => string,
  selfId: string | null,
): string {
  if (chat.kind === "group") {
    return chat.title || chat.entityTitle || "Групповой чат";
  }
  const other = chat.memberIds.find((id) => id !== selfId) ?? chat.memberIds[0];
  return other ? resolveName(other) : "Личный чат";
}

export function MessengerChatList({
  activeChatId,
  onOpenChat,
}: {
  activeChatId: string | null;
  onOpenChat: (chatId: string) => void;
}) {
  const chats = useMessengerChats();
  const showArchived = useShowArchivedChats();
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const resolveName = (userId: string) =>
      getSystemUserNameByAuthId(entities, userId) ?? userId.slice(0, 8);
    const base = chats.filter((chat) =>
      showArchived ? chat.status === "archived" : chat.status === "active",
    );
    return filterMessengerChats(base, query, resolveName);
  }, [chats, showArchived, query, entities]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-border px-3 py-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск…"
          className="h-9 text-sm"
        />
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={!showArchived ? "secondary" : "ghost"}
            className="h-7 flex-1 text-xs"
            onClick={() => setShowArchivedChats(false)}
          >
            Активные
          </Button>
          <Button
            type="button"
            size="sm"
            variant={showArchived ? "secondary" : "ghost"}
            className="h-7 flex-1 text-xs"
            onClick={() => setShowArchivedChats(true)}
          >
            <Archive className="mr-1 size-3" />
            Архив
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {showArchived ? "Архив пуст" : "Нет чатов"}
          </p>
        ) : (
          visible.map((chat) => {
            const title = chatDisplayTitle(
              chat,
              (userId) =>
                getSystemUserNameByAuthId(entities, userId) ??
                userId.slice(0, 8),
              sessionUser?.id ?? null,
            );
            const active = chat.id === activeChatId;
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => {
                  void selectMessengerChat(chat.id);
                  onOpenChat(chat.id);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-accent/70"
                    : chat.unreadCount > 0
                      ? "bg-primary/5 hover:bg-accent/50"
                      : "hover:bg-muted/50",
                )}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {chat.kind === "group" ? (
                    <Users className="size-4" />
                  ) : (
                    getPersonInitials(title)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    {chat.myIsPinned ? (
                      <Pin className="size-3 shrink-0 text-muted-foreground" />
                    ) : null}
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {title}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {chat.lastMessageAt
                        ? formatTimestampDisplay(chat.lastMessageAt)
                        : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    {chat.lastMessageHasAttachment ? (
                      <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    ) : null}
                    <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {chat.lastMessagePreview || "Нет сообщений"}
                    </p>
                    {chat.unreadCount > 0 ? (
                      <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  {chat.entityTitle ? (
                    <span className="mt-1 inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {chat.entityTitle}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
