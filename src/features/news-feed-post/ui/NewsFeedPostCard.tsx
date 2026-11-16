import { useMemo, useState } from "react";
import { MessageCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEntityConfig } from "@/entities/entity";
import {
  deleteNewsFeedPost,
  resolveFeedAuthorName,
  type FeedPost,
} from "@/entities/news-feed";
import { useAppNavigate } from "@/shared/lib/navigation";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { NewsFeedComposeDialog } from "@/features/news-feed-compose";
import { NewsFeedPostContent } from "./NewsFeedPostContent";

export function NewsFeedPostCard({ post }: { post: FeedPost }) {
  const { entities } = useEntityConfig();
  const { openFeedPost } = useAppNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const authorName = useMemo(
    () => resolveFeedAuthorName(entities, post.authorId),
    [entities, post.authorId],
  );

  return (
    <article
      role="link"
      tabIndex={0}
      className="group cursor-pointer rounded-2xl border border-border/80 bg-card px-5 py-5 transition-colors hover:border-border hover:bg-muted/10 md:px-6 md:py-6"
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (
          target?.closest(
            "a, button, input, textarea, label, [role='button'], [data-stop-feed-nav]",
          )
        ) {
          return;
        }
        openFeedPost(post.id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openFeedPost(post.id);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <NewsFeedPostContent
            post={post}
            meta={
              <>
                <p className="text-sm font-medium text-foreground">
                  {authorName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTimestampDisplay(post.createdAt)}
                  {post.editedAt ? " · изменено" : null}
                </p>
              </>
            }
          />
        </div>
        {post.canManage ? (
          <div
            className="shrink-0"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" searchable={false}>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="size-3.5" />
                  Редактировать
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1 font-medium transition-colors group-hover:bg-muted group-hover:text-foreground">
          <MessageCircle className="size-3.5" />
          Комментарии · {post.commentCount}
        </span>
        <span className="opacity-0 transition-opacity group-hover:opacity-100">
          Открыть
        </span>
      </div>

      <NewsFeedComposeDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        post={post}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить публикацию?"
        description="Вы уверены, что хотите удалить публикацию? Она исчезнет из ленты для всех получателей."
        confirmLabel="Удалить"
        onConfirm={async () => {
          try {
            await deleteNewsFeedPost(post.id);
            toast.success("Публикация удалена");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Не удалось удалить",
            );
            throw error;
          }
        }}
      />
    </article>
  );
}
