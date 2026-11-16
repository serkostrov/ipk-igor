import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  assertMessengerFileAllowed,
  sendMessengerMessage,
  setMessengerDraft,
  useActiveMessengerChatId,
  useMessengerDraft,
  useMessengerMessages,
} from "@/entities/messenger";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/cn";

export function MessengerCompose() {
  const chatId = useActiveMessengerChatId();
  const draft = useMessengerDraft();
  const messages = useMessengerMessages();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const replyMessage = draft.replyToId
    ? messages.find((item) => item.id === draft.replyToId)
    : null;

  if (!chatId) return null;

  function onPickFiles(list: FileList | null) {
    if (!list?.length) return;
    const next: File[] = [];
    for (const file of Array.from(list)) {
      try {
        assertMessengerFileAllowed(file);
        next.push(file);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Не удалось загрузить файл",
        );
      }
    }
    setFiles((current) => [...current, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSend() {
    if (!chatId) return;
    const body = draft.text.trim();
    if (!body && files.length === 0) return;
    setBusy(true);
    try {
      await sendMessengerMessage({ chatId, body, files });
      setFiles([]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось отправить сообщение. Попробуйте еще раз.",
      );
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-background px-3 py-2.5">
      {replyMessage ? (
        <div className="mb-2 flex items-start gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-muted-foreground">Ответ</p>
            <p className="truncate text-foreground">
              {replyMessage.deletedAt
                ? "Сообщение удалено"
                : replyMessage.body || "Вложение"}
            </p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="size-6"
            onClick={() => setMessengerDraft(chatId, { replyToId: null })}
            aria-label="Отменить ответ"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {files.map((file) => (
            <span
              key={`${file.name}-${file.size}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px]"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setFiles((current) => current.filter((item) => item !== file))
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          multiple
          onChange={(event) => onPickFiles(event.target.files)}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={() => fileRef.current?.click()}
          aria-label="Прикрепить файл"
          disabled={busy}
        >
          <Paperclip className="size-4" />
        </Button>
        <Textarea
          value={draft.text}
          onChange={(event) =>
            setMessengerDraft(chatId, { text: event.target.value })
          }
          onKeyDown={onKeyDown}
          placeholder="Сообщение…"
          rows={1}
          className={cn("min-h-8 max-h-28 flex-1 resize-none py-1.5 text-sm")}
          disabled={busy}
        />
        <Button
          type="button"
          size="icon-sm"
          className="size-8 shrink-0"
          onClick={() => void handleSend()}
          disabled={busy || (!draft.text.trim() && files.length === 0)}
          aria-label="Отправить"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
