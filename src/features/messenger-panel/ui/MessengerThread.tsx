import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Copy,
  EllipsisVertical,
  ExternalLink,
  Pencil,
  Pin,
  Reply,
  Trash2,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { canEntity, useCurrentRole } from "@/entities/access";
import { getSystemUserNameByAuthId, useEntityConfig } from "@/entities/entity";
import {
  archiveMessengerChat,
  deleteMessengerMessage,
  editMessengerMessage,
  formatFileSize,
  getMessengerCrmNavigateLabel,
  getMessengerFileUrl,
  leaveMessengerChat,
  loadOlderMessengerMessages,
  pinMessengerChat,
  pinMessengerMessage,
  renameMessengerChat,
  setMessengerDraft,
  setMessengerSoundEnabled,
  uploadMessengerAvatar,
  useActiveMessengerChatId,
  useMessengerChats,
  useMessengerHasMore,
  useMessengerMembers,
  useMessengerMessages,
  useMessengerMessagesStatus,
  useMessengerSoundEnabled,
  type MessengerMessage,
} from "@/entities/messenger";
import { useSessionUser } from "@/entities/session";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { MessengerBindDialog } from "./MessengerBindDialog";
import { MessengerCompose } from "./MessengerCompose";
import { MessengerMessageBody } from "./MessengerMessageBody";
import { MessengerParticipantsDialog } from "./MessengerParticipantsDialog";
import { MessengerReadReceipts } from "./MessengerReadReceipts";

export function MessengerThread({
  onBack,
  onOpenRecord,
}: {
  onBack?: () => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const chatId = useActiveMessengerChatId();
  const chats = useMessengerChats();
  const messages = useMessengerMessages();
  const hasMore = useMessengerHasMore();
  const members = useMessengerMembers();
  const status = useMessengerMessagesStatus();
  const soundEnabled = useMessengerSoundEnabled();
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const role = useCurrentRole();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const stickToBottomRef = useRef(true);

  const activeChat = chats.find((item) => item.id === chatId) ?? null;
  const pinned = activeChat?.pinnedMessageId
    ? messages.find((item) => item.id === activeChat.pinnedMessageId)
    : null;

  const resolveName = (userId: string | null) =>
    userId
      ? (getSystemUserNameByAuthId(entities, userId) ?? userId.slice(0, 8))
      : "Система";

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, chatId]);

  if (!chatId || !activeChat) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Выберите чат</p>
        <p className="text-sm text-muted-foreground">
          Переписка откроется в этой области
        </p>
      </div>
    );
  }

  const currentChat = activeChat;
  const currentChatId = currentChat.id;

  const title =
    currentChat.kind === "direct"
      ? resolveName(
          currentChat.memberIds.find((id) => id !== sessionUser?.id) ?? null,
        )
      : currentChat.title || currentChat.entityTitle || "Групповой чат";

  const crmEntity = currentChat.entityId
    ? entities.find((item) => item.id === currentChat.entityId)
    : null;
  const canOpenCrm =
    currentChat.entityId &&
    currentChat.recordId &&
    crmEntity &&
    canEntity(role, currentChat.entityId, "read");

  async function onOpenAttachment(storagePath: string) {
    try {
      const url = await getMessengerFileUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось открыть файл",
      );
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    try {
      await editMessengerMessage(editingId, editText.trim());
      setEditingId(null);
      setEditText("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось изменить сообщение",
      );
    }
  }

  function renderMessage(message: MessengerMessage) {
    if (message.kind === "system") {
      return (
        <div
          key={message.id}
          className="mx-auto max-w-[90%] px-2 py-1 text-center text-[11px] text-muted-foreground"
        >
          {message.body}
        </div>
      );
    }

    const mine = message.authorId === sessionUser?.id;
    const deleted = Boolean(message.deletedAt);

    return (
      <div
        key={message.id}
        id={`messenger-msg-${message.id}`}
        className={cn(
          "group flex flex-col gap-0.5 px-2",
          mine ? "items-end" : "items-start",
        )}
      >
        {!mine ? (
          <span className="px-1 text-[10px] text-muted-foreground">
            {resolveName(message.authorId)}
          </span>
        ) : null}
        <div
          className={cn(
            "relative max-w-[85%] rounded-2xl px-3 py-2 text-sm",
            mine
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md bg-muted text-foreground",
            deleted && "italic opacity-70",
          )}
        >
          {message.replyToId ? (
            <button
              type="button"
              className={cn(
                "mb-1 block w-full truncate rounded-md border-l-2 px-2 py-1 text-left text-[11px]",
                mine
                  ? "border-primary-foreground/50 bg-primary-foreground/10"
                  : "border-foreground/30 bg-background/50",
              )}
              onClick={() => {
                document
                  .getElementById(`messenger-msg-${message.replyToId}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Ответ на сообщение
            </button>
          ) : null}

          {editingId === message.id ? (
            <div className="space-y-1.5">
              <Input
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                className="h-8 bg-background text-foreground"
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void saveEdit()}
                >
                  Сохранить
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setEditingId(null)}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : deleted ? (
            <span>Сообщение удалено</span>
          ) : (
            <MessengerMessageBody
              text={message.body}
              onOpenRecord={onOpenRecord}
              className={mine ? "text-primary-foreground" : undefined}
            />
          )}

          {!deleted && message.attachments.length > 0 ? (
            <div className="mt-1.5 space-y-1">
              {message.attachments.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => void onOpenAttachment(att.storagePath)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                    mine
                      ? "bg-primary-foreground/15 hover:bg-primary-foreground/25"
                      : "bg-background/70 hover:bg-background",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {att.fileName}
                  </span>
                  <span className="shrink-0 opacity-70">
                    {formatFileSize(att.sizeBytes)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-[10px]",
              mine ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {message.editedAt ? <span>Изменено</span> : null}
            <span>{formatTimestampDisplay(message.createdAt)}</span>
            {mine ? (
              <MessengerReadReceipts
                messageId={message.id}
                className="max-w-[10rem] truncate opacity-80"
              />
            ) : null}
          </div>

          {!deleted ? (
            <div className="absolute -top-2 right-1 hidden group-hover:block">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="size-6 shadow-sm"
                    />
                  }
                >
                  <EllipsisVertical className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? "end" : "start"}>
                  <DropdownMenuItem
                    onClick={() =>
                      setMessengerDraft(currentChatId, {
                        replyToId: message.id,
                      })
                    }
                  >
                    <Reply className="size-3.5" />
                    Ответить
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void copyTextToClipboard(message.body).then(
                        () => toast.success("Скопировано"),
                        () => toast.error("Не удалось скопировать"),
                      );
                    }}
                  >
                    <Copy className="size-3.5" />
                    Копировать текст
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      void pinMessengerMessage(currentChatId, message.id).catch(
                        (error: unknown) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Не удалось закрепить",
                          ),
                      );
                    }}
                  >
                    <Pin className="size-3.5" />
                    Закрепить
                  </DropdownMenuItem>
                  {mine ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingId(message.id);
                          setEditText(message.body);
                        }}
                      >
                        <Pencil className="size-3.5" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          void deleteMessengerMessage(message.id).catch(
                            (error: unknown) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Не удалось удалить",
                              ),
                          );
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Удалить
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2.5">
        {onBack ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-8 shrink-0 md:hidden"
            onClick={onBack}
            aria-label="К списку"
          >
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {members.length} участн.
            {currentChat.entityTitle ? ` · ${currentChat.entityTitle}` : ""}
          </p>
        </div>
        {canOpenCrm &&
        currentChat.entityId &&
        currentChat.recordId &&
        crmEntity ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 gap-1 text-xs"
            onClick={() =>
              onOpenRecord?.(currentChat.entityId!, currentChat.recordId!)
            }
          >
            <ExternalLink className="size-3.5" />
            {getMessengerCrmNavigateLabel(crmEntity)}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="size-8"
              />
            }
          >
            <EllipsisVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setParticipantsOpen(true)}>
              <Users className="size-3.5" />
              Участники
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void pinMessengerChat(currentChat.id, !currentChat.myIsPinned);
              }}
            >
              <Pin className="size-3.5" />
              {currentChat.myIsPinned ? "Открепить чат" : "Закрепить чат"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setMessengerSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? (
                <VolumeX className="size-3.5" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
              {soundEnabled ? "Выключить звук" : "Включить звук"}
            </DropdownMenuItem>
            {currentChat.kind === "group" && currentChat.myRole === "admin" ? (
              <DropdownMenuItem
                onClick={() => {
                  const next = window.prompt(
                    "Название чата",
                    currentChat.title,
                  );
                  if (next == null) return;
                  void renameMessengerChat(currentChat.id, next).catch(
                    (error: unknown) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Не удалось переименовать",
                      ),
                  );
                }}
              >
                <Pencil className="size-3.5" />
                Переименовать
              </DropdownMenuItem>
            ) : null}
            {currentChat.kind === "group" && currentChat.myRole === "admin" ? (
              <DropdownMenuItem
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    void uploadMessengerAvatar(currentChat.id, file).catch(
                      (error: unknown) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Не удалось загрузить аватар",
                        ),
                    );
                  };
                  input.click();
                }}
              >
                Аватар группы
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => setBindOpen(true)}>
              <ExternalLink className="size-3.5" />
              Привязать к CRM
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void archiveMessengerChat(
                  currentChat.id,
                  currentChat.status !== "archived",
                ).catch((error: unknown) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Не удалось изменить архив",
                  ),
                );
              }}
            >
              <Archive className="size-3.5" />
              {currentChat.status === "archived" ? "Из архива" : "В архив"}
            </DropdownMenuItem>
            {currentChat.pinnedMessageId ? (
              <DropdownMenuItem
                onClick={() => {
                  void pinMessengerMessage(currentChatId, null);
                }}
              >
                Открепить сообщение
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                void leaveMessengerChat(currentChat.id).catch(
                  (error: unknown) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Не удалось выйти из чата",
                    ),
                );
              }}
            >
              Выйти из чата
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {pinned && !pinned.deletedAt ? (
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-left text-xs"
          onClick={() =>
            document
              .getElementById(`messenger-msg-${pinned.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          <Pin className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {pinned.body || "Вложение"}
          </span>
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 flex-col space-y-2 overflow-y-auto py-2"
        onScroll={(event) => {
          const el = event.currentTarget;
          stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          if (el.scrollTop < 40 && hasMore) {
            void loadOlderMessengerMessages();
          }
        }}
      >
        {status === "loading" && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3 py-10">
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3 py-10">
            <p className="text-sm text-muted-foreground">
              Напишите первое сообщение
            </p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
      </div>

      <MessengerCompose />

      <MessengerParticipantsDialog
        open={participantsOpen}
        onOpenChange={setParticipantsOpen}
        chatId={currentChat.id}
        isAdmin={currentChat.myRole === "admin"}
        kind={currentChat.kind}
      />
      <MessengerBindDialog
        open={bindOpen}
        onOpenChange={setBindOpen}
        chatId={currentChat.id}
      />
    </div>
  );
}
