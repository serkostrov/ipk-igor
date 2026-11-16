import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/entities/access";
import {
  createNewsFeedComment,
  removeNewsFeedComment,
  resolveFeedAuthorName,
  saveNewsFeedComment,
  type FeedComment,
} from "@/entities/news-feed";
import { useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Textarea } from "@/shared/ui/textarea";

export function NewsFeedComments({
  postId,
  comments,
  commentCount,
  variant = "card",
}: {
  postId: string;
  comments: FeedComment[];
  commentCount: number;
  /** On the post page comments stay open and use a fuller layout. */
  variant?: "card" | "page";
}) {
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const isAdmin = useIsAdmin();
  const myId = sessionUser?.id ?? null;
  const alwaysOpen = variant === "page";

  const [open, setOpen] = useState(alwaysOpen);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const visible = alwaysOpen || open;

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await createNewsFeedComment(postId, body);
      setDraft("");
      setOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось отправить",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    const body = editBody.trim();
    if (!body) return;
    setBusy(true);
    try {
      await saveNewsFeedComment(editingId, body);
      setEditingId(null);
      setEditBody("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {alwaysOpen ? (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">
            Комментарии
          </h2>
          <span className="text-xs text-muted-foreground">{commentCount}</span>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex items-center rounded-full bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
        >
          Комментарии · {commentCount}
        </button>
      )}

      {visible ? (
        <div className="space-y-4">
          {comments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/80 px-4 py-8 text-center text-sm text-muted-foreground">
              Пока нет комментариев — напишите первый
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => {
                const canModify =
                  isAdmin || (myId != null && comment.authorId === myId);
                const editing = editingId === comment.id;
                const name = resolveFeedAuthorName(entities, comment.authorId);
                return (
                  <li
                    key={comment.id}
                    className="rounded-xl border border-border/70 bg-muted/10 px-3.5 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatTimestampDisplay(comment.createdAt)}
                          {comment.editedAt ? " · изменено" : null}
                        </p>
                      </div>
                      {canModify ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                          {myId != null && comment.authorId === myId ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => {
                                setEditingId(comment.id);
                                setEditBody(comment.body);
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={() => setDeleteId(comment.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {editing ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          value={editBody}
                          onChange={(event) => setEditBody(event.target.value)}
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleSaveEdit()}
                          >
                            Сохранить
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(null);
                              setEditBody("");
                            }}
                          >
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                        {comment.body}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-background p-3 sm:flex-row sm:items-end">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Написать комментарий..."
              rows={2}
              className="min-h-[64px] flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void handleSend()}
            >
              Отправить
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteId != null}
        onOpenChange={(next) => {
          if (!next) setDeleteId(null);
        }}
        title="Удалить комментарий?"
        description="Комментарий будет удалён и больше не отобразится в ленте."
        confirmLabel="Удалить"
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await removeNewsFeedComment(postId, deleteId);
            setDeleteId(null);
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Не удалось удалить",
            );
            throw error;
          }
        }}
      />
    </div>
  );
}
