import { useEffect, useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useCanCreateNewsPosts } from "@/entities/access";
import {
  findLegalEntitiesEntity,
  useEntityConfig,
} from "@/entities/entity";
import {
  loadMoreNewsFeed,
  loadNewsFeed,
  resolveFeedAuthorName,
  resolveLegalEntityLabel,
  useNewsFeedError,
  useNewsFeedHasMore,
  useNewsFeedIsAdminViewer,
  useNewsFeedLoadingMore,
  useNewsFeedPosts,
  useNewsFeedStatus,
  type FeedPost,
} from "@/entities/news-feed";
import { NewsFeedComposeDialog } from "@/features/news-feed-compose";
import { NewsFeedPostCard } from "@/features/news-feed-post";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
const AUDIENCE_ALL = "__all__";
const AUDIENCE_EVERYONE = "__everyone__";
const KIND_ALL = "__all__";

type ContentKind = "" | "poll" | "files" | "forms" | "links";

function matchesQuery(
  post: FeedPost,
  query: string,
  authorName: string,
): boolean {
  if (!query) return true;
  const haystack = [
    post.title,
    post.body,
    authorName,
    ...post.links.map((link) => `${link.title} ${link.url}`),
    post.poll?.question ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesAudience(post: FeedPost, audience: string): boolean {
  if (!audience) return true;
  if (audience === AUDIENCE_EVERYONE) return post.targetsAll;
  if (post.targetsAll) return true;
  return post.legalEntityIds.includes(audience);
}

function matchesKind(post: FeedPost, kind: ContentKind): boolean {
  if (!kind) return true;
  if (kind === "poll") return post.poll != null;
  if (kind === "files") return post.attachments.length > 0;
  if (kind === "forms")
    return post.links.some((link) => link.kind === "google_form");
  if (kind === "links")
    return post.links.some((link) => link.kind === "external");
  return true;
}

export function NewsFeedPage() {
  const canCreate = useCanCreateNewsPosts();
  const isAdminViewer = useNewsFeedIsAdminViewer();
  const { entities } = useEntityConfig();
  const posts = useNewsFeedPosts();
  const status = useNewsFeedStatus();
  const error = useNewsFeedError();
  const hasMore = useNewsFeedHasMore();
  const loadingMore = useNewsFeedLoadingMore();
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("");
  const [kind, setKind] = useState<ContentKind>("");

  useEffect(() => {
    void loadNewsFeed();
  }, []);

  const legalEntitiesEntity = useMemo(
    () => findLegalEntitiesEntity(entities),
    [entities],
  );

  const audienceOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const post of posts) {
      for (const id of post.legalEntityIds) ids.add(id);
    }
    return [...ids]
      .map((id) => ({
        id,
        label: resolveLegalEntityLabel(
          entities,
          id,
          legalEntitiesEntity?.id ?? null,
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [posts, entities, legalEntitiesEntity?.id]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const authorName = resolveFeedAuthorName(entities, post.authorId);
      return (
        matchesQuery(post, normalizedQuery, authorName) &&
        matchesAudience(post, audience) &&
        matchesKind(post, kind)
      );
    });
  }, [posts, entities, normalizedQuery, audience, kind]);

  const hasFilters = Boolean(normalizedQuery || audience || kind);
  const selectedAudienceLabel =
    audience === AUDIENCE_EVERYONE
      ? "все юрлица"
      : (audienceOptions.find((item) => item.id === audience)?.label ?? "все");
  const kindLabels: Record<Exclude<ContentKind, "">, string> = {
    poll: "с опросом",
    files: "с файлами",
    forms: "с формой",
    links: "со ссылкой",
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6 md:p-8">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Лента</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Новости и объявления
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => setComposeOpen(true)}>
            <Plus className="size-4" />
            Создать публикацию
          </Button>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 basis-[16rem]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по ленте"
            aria-label="Поиск по ленте"
            className="h-9 pl-8"
          />
        </div>

        {isAdminViewer ? (
          <Select
            value={audience || AUDIENCE_ALL}
            onValueChange={(next) => {
              if (next == null) return;
              const value = String(next);
              setAudience(value === AUDIENCE_ALL ? "" : value);
            }}
          >
            <SelectTrigger className="h-9 w-52" aria-label="Аудитория">
              <SelectValue>
                <span className="truncate">
                  <span className="text-muted-foreground">Аудитория:</span>{" "}
                  {selectedAudienceLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUDIENCE_ALL}>Все</SelectItem>
              <SelectItem value={AUDIENCE_EVERYONE}>Все юрлица</SelectItem>
              {audienceOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={kind || KIND_ALL}
          onValueChange={(next) => {
            if (next == null) return;
            const value = String(next);
            setKind(value === KIND_ALL ? "" : (value as ContentKind));
          }}
        >
          <SelectTrigger className="h-9 w-48" aria-label="Тип">
            <SelectValue>
              <span className="truncate">
                <span className="text-muted-foreground">Тип:</span>{" "}
                {kind ? kindLabels[kind] : "все"}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={KIND_ALL}>Все</SelectItem>
            <SelectItem value="poll">С опросом</SelectItem>
            <SelectItem value="files">С файлами</SelectItem>
            <SelectItem value="forms">С формой</SelectItem>
            <SelectItem value="links">Со ссылкой</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setQuery("");
              setAudience("");
              setKind("");
            }}
          >
            <X className="size-3.5" />
            Сбросить
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-3">
          {status === "loading" && posts.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Загрузка…
            </p>
          ) : null}

          {status === "error" && posts.length === 0 ? (
            <div className="space-y-3 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {error ?? "Не удалось загрузить ленту"}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadNewsFeed({ force: true })}
              >
                Повторить
              </Button>
            </div>
          ) : null}

          {status === "ready" && posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-20 text-center">
              <p className="text-sm font-medium text-foreground">
                Пока нет публикаций
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canCreate
                  ? "Создайте первую новость для сотрудников"
                  : "Здесь появятся новости, доступные вашим юрлицам"}
              </p>
              {canCreate ? (
                <Button
                  type="button"
                  className="mt-4"
                  onClick={() => setComposeOpen(true)}
                >
                  <Plus className="size-4" />
                  Создать публикацию
                </Button>
              ) : null}
            </div>
          ) : null}

          {status !== "loading" &&
          posts.length > 0 &&
          filteredPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                Ничего не найдено
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Измените фильтры или сбросьте поиск
              </p>
            </div>
          ) : null}

          {filteredPosts.map((post) => (
            <NewsFeedPostCard key={post.id} post={post} />
          ))}

          {hasMore ? (
            <div className="flex justify-center py-2">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMoreNewsFeed()}
              >
                {loadingMore ? "Загрузка…" : "Ещё"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <NewsFeedComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}
