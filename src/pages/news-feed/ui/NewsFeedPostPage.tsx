import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEntityConfig } from "@/entities/entity";
import {
  deleteNewsFeedPost,
  loadNewsFeedPost,
  resolveFeedAuthorName,
  useNewsFeedPosts,
  type FeedPost,
} from "@/entities/news-feed";
import { NewsFeedComposeDialog } from "@/features/news-feed-compose";
import {
  NewsFeedComments,
  NewsFeedPostContent,
} from "@/features/news-feed-post";
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

export function NewsFeedPostPage({ postId }: { postId: string }) {
  const { entities } = useEntityConfig();
  const { back } = useAppNavigate();
  const posts = useNewsFeedPosts();
  const fromStore = posts.find((item) => item.id === postId) ?? null;

  const [post, setPost] = useState<FeedPost | null>(fromStore);
  const [loading, setLoading] = useState(fromStore == null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading((current) => current || fromStore == null);
      setError(null);
      try {
        const next = await loadNewsFeedPost(postId);
        if (cancelled) return;
        setPost(next);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Не удалось загрузить публикацию",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only when postId changes — store sync is below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    if (fromStore) setPost(fromStore);
  }, [fromStore]);

  const authorName = useMemo(
    () => (post ? resolveFeedAuthorName(entities, post.authorId) : ""),
    [entities, post],
  );

  if (loading && !post) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  if ((error && !post) || (!loading && !post)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-muted-foreground">
          {error ?? "Публикация не найдена"}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => back({ type: "feed" })}
        >
          <ArrowLeft className="size-4" />
          К ленте
        </Button>
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/80 px-4 py-3 md:px-8">
        <div className="flex w-full items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => back({ type: "feed" })}
          >
            <ArrowLeft className="size-4" />
            Лента
          </Button>
          {post.canManage ? (
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
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
          <NewsFeedPostContent
            post={post}
            titleAs="h1"
            largeMedia
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

          <section className="rounded-2xl border border-border/80 bg-card p-4 md:p-5">
            <NewsFeedComments
              postId={post.id}
              comments={post.comments}
              commentCount={post.commentCount}
              variant="page"
            />
          </section>
        </div>
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
            back({ type: "feed" });
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Не удалось удалить",
            );
            throw err;
          }
        }}
      />
    </div>
  );
}
