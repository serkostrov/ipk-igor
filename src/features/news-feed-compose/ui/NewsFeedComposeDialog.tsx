import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  findLegalEntitiesEntity,
  getRelationRecordOptions,
  parseEntityRelationIds,
  RelationSelect,
  serializeEntityRelationIds,
  useEntityConfig,
} from "@/entities/entity";
import {
  assertFeedFileAllowed,
  assertFeedFilesCount,
  FEED_MAX_FILES_PER_POST,
  formatFeedFileSize,
  type FeedLinkInput,
  type FeedPost,
  type FeedPostInput,
  publishNewsFeedPost,
  saveNewsFeedPost,
} from "@/entities/news-feed";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import { TimePicker } from "@/shared/ui/time-picker";
import { cn } from "@/shared/lib/cn";
import { joinDatetime, splitDatetime } from "@/shared/lib/format-date";

type DraftLink = {
  kind: "external" | "google_form";
  url: string;
  title: string;
};

type DraftPoll = {
  enabled: boolean;
  question: string;
  allowMultiple: boolean;
  endsAt: string;
  options: string[];
};

function emptyPoll(): DraftPoll {
  return {
    enabled: false,
    question: "",
    allowMultiple: false,
    endsAt: "",
    options: ["", ""],
  };
}

function linksFromPost(post: FeedPost | null): DraftLink[] {
  if (!post) return [];
  return post.links.map((link) => ({
    kind: link.kind,
    url: link.url,
    title: link.title,
  }));
}

function pollFromPost(post: FeedPost | null): DraftPoll {
  if (!post?.poll) return emptyPoll();
  return {
    enabled: true,
    question: post.poll.question,
    allowMultiple: post.poll.allowMultiple,
    endsAt: post.poll.endsAt ? post.poll.endsAt.slice(0, 16) : "",
    options:
      post.poll.options.length >= 2
        ? post.poll.options.map((item) => item.label)
        : ["", ""],
  };
}

function validateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildInput(params: {
  title: string;
  body: string;
  targetsAll: boolean;
  legalEntityIds: string[];
  links: DraftLink[];
  poll: DraftPoll;
  keepPoll: boolean;
}): FeedPostInput {
  const links: FeedLinkInput[] = [];
  for (const link of params.links) {
    const url = link.url.trim();
    if (!url) continue;
    if (!validateUrl(url)) {
      throw new Error("Проверьте корректность URL");
    }
    links.push({
      kind: link.kind,
      url,
      title: link.title.trim(),
    });
  }

  let poll: FeedPostInput["poll"] = null;
  if (params.poll.enabled) {
    const question = params.poll.question.trim();
    const options = params.poll.options
      .map((item) => item.trim())
      .filter(Boolean);
    if (!question) throw new Error("Укажите вопрос опроса");
    if (options.length < 2) {
      throw new Error("В опросе должно быть минимум 2 варианта");
    }
    poll = {
      question,
      allowMultiple: params.poll.allowMultiple,
      endsAt: params.poll.endsAt.trim()
        ? new Date(params.poll.endsAt).toISOString()
        : null,
      options,
    };
  }

  if (!params.targetsAll && params.legalEntityIds.length === 0) {
    throw new Error("Выберите юридические лица или «Все»");
  }

  return {
    title: params.title.trim(),
    body: params.body.trim(),
    targetsAll: params.targetsAll,
    legalEntityIds: params.targetsAll ? [] : params.legalEntityIds,
    links,
    poll,
    keepPoll: params.keepPoll,
  };
}

export function NewsFeedComposeDialog({
  open,
  onOpenChange,
  post = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post?: FeedPost | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <NewsFeedComposeForm
          key={post?.id ?? "new"}
          post={post}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </Dialog>
  );
}

function NewsFeedComposeForm({
  post,
  onOpenChange,
}: {
  post: FeedPost | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { entities } = useEntityConfig();
  const editing = post != null;
  const pollLocked = Boolean(post?.poll?.hasVoted || post?.poll?.totalVotes);

  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [targetsAll, setTargetsAll] = useState(post?.targetsAll ?? false);
  const [legalEntityIds, setLegalEntityIds] = useState<string[]>(
    post?.legalEntityIds ?? [],
  );
  const [links, setLinks] = useState<DraftLink[]>(() => linksFromPost(post));
  const [poll, setPoll] = useState<DraftPoll>(() => pollFromPost(post));
  const [files, setFiles] = useState<File[]>([]);
  const [removeAttachmentIds, setRemoveAttachmentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const legalEntitiesEntity = useMemo(
    () => findLegalEntitiesEntity(entities),
    [entities],
  );
  const legalEntityOptions = useMemo(
    () => getRelationRecordOptions(legalEntitiesEntity, entities),
    [legalEntitiesEntity, entities],
  );

  const visibleAttachments = useMemo(() => {
    if (!post) return [];
    return post.attachments.filter(
      (item) => !removeAttachmentIds.includes(item.id),
    );
  }, [post, removeAttachmentIds]);

  function addLink(kind: DraftLink["kind"]) {
    setLinks((current) => [...current, { kind, url: "", title: "" }]);
  }

  function updateLink(index: number, patch: Partial<DraftLink>) {
    setLinks((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeLink(index: number) {
    setLinks((current) => current.filter((_, i) => i !== index));
  }

  function onPickFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    try {
      const next = Array.from(list);
      for (const file of next) assertFeedFileAllowed(file);
      assertFeedFilesCount(
        visibleAttachments.length + files.length,
        next.length,
      );
      setFiles((current) => [...current, ...next]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось добавить файлы",
      );
    }
  }

  async function handleSubmit() {
    setBusy(true);
    try {
      const input = buildInput({
        title,
        body,
        targetsAll,
        legalEntityIds,
        links,
        poll,
        keepPoll: pollLocked && poll.enabled,
      });
      if (!input.title) throw new Error("Укажите заголовок");
      if (!input.body) throw new Error("Укажите текст публикации");

      if (editing && post) {
        await saveNewsFeedPost(post.id, input, {
          filesToAdd: files,
          attachmentIdsToRemove: removeAttachmentIds,
        });
        toast.success("Публикация сохранена");
      } else {
        await publishNewsFeedPost(input, files);
        toast.success("Публикация создана");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
        <DialogTitle>
          {editing ? "Редактировать публикацию" : "Создать публикацию"}
        </DialogTitle>
        <DialogDescription>
          Новости и объявления для выбранных юридических лиц
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <div className="space-y-2">
          <Label htmlFor="feed-title">Заголовок</Label>
          <Input
            id="feed-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Краткий заголовок"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="feed-body">Текст публикации</Label>
          <Textarea
            id="feed-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Текст новости или объявления"
            rows={6}
          />
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Юридические лица</p>
              <p className="text-xs text-muted-foreground">
                Кому будет видна публикация
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="feed-targets-all" className="text-xs">
                Все юрлица
              </Label>
              <Switch
                id="feed-targets-all"
                checked={targetsAll}
                onCheckedChange={setTargetsAll}
              />
            </div>
          </div>
          {!targetsAll ? (
            legalEntitiesEntity ? (
              <RelationSelect
                id="feed-legal-entities"
                multiple
                options={legalEntityOptions}
                value={serializeEntityRelationIds(legalEntityIds)}
                placeholder="Выберите юрлица"
                aria-label="Юридические лица"
                onChange={(value) =>
                  setLegalEntityIds(parseEntityRelationIds(value))
                }
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Каталог «Юрлица» не найден в конфигурации сущностей
              </p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              Публикация будет доступна всем пользователям с доступом к ленте
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Вложения</Label>
            <span className="text-[11px] text-muted-foreground">
              до {FEED_MAX_FILES_PER_POST} файлов, 25 МБ
            </span>
          </div>
          {visibleAttachments.length > 0 ? (
            <ul className="space-y-1.5">
              {visibleAttachments.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {item.fileName}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatFeedFileSize(item.sizeBytes)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() =>
                      setRemoveAttachmentIds((current) => [...current, item.id])
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {files.length > 0 ? (
            <ul className="space-y-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {file.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatFeedFileSize(file.size)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-4 py-8 transition-colors hover:border-border hover:bg-muted/20">
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                onPickFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <span className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm shadow-xs">
              Добавить файлы
            </span>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="mr-auto">Ссылки</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addLink("external")}
            >
              <Plus className="size-3.5" />
              Внешняя ссылка
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addLink("google_form")}
            >
              <Plus className="size-3.5" />
              Google Form
            </Button>
          </div>
          {links.map((link, index) => (
            <div
              key={`${link.kind}-${index}`}
              className="space-y-2 rounded-xl border border-border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {link.kind === "google_form"
                    ? "Google Form"
                    : "Внешняя ссылка"}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => removeLink(index)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <Input
                value={link.title}
                onChange={(event) =>
                  updateLink(index, { title: event.target.value })
                }
                placeholder="Название"
              />
              <Input
                value={link.url}
                onChange={(event) =>
                  updateLink(index, { url: event.target.value })
                }
                placeholder="https://"
              />
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Опрос</p>
              <p className="text-xs text-muted-foreground">
                Встроенный опрос в публикации
              </p>
            </div>
            <Switch
              checked={poll.enabled}
              disabled={pollLocked}
              onCheckedChange={(checked) =>
                setPoll((current) => ({ ...current, enabled: checked }))
              }
            />
          </div>
          {poll.enabled ? (
            <div className="space-y-3">
              {pollLocked ? (
                <p className="text-xs text-muted-foreground">
                  В опросе уже есть голоса — структуру менять нельзя
                </p>
              ) : null}
              <Input
                value={poll.question}
                disabled={pollLocked}
                onChange={(event) =>
                  setPoll((current) => ({
                    ...current,
                    question: event.target.value,
                  }))
                }
                placeholder="Вопрос"
              />
              <div className="space-y-2">
                {poll.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={option}
                      disabled={pollLocked}
                      onChange={(event) =>
                        setPoll((current) => ({
                          ...current,
                          options: current.options.map((item, i) =>
                            i === index ? event.target.value : item,
                          ),
                        }))
                      }
                      placeholder={`Вариант ${index + 1}`}
                    />
                    {!pollLocked && poll.options.length > 2 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() =>
                          setPoll((current) => ({
                            ...current,
                            options: current.options.filter(
                              (_, i) => i !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                {!pollLocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPoll((current) => ({
                        ...current,
                        options: [...current.options, ""],
                      }))
                    }
                  >
                    <Plus className="size-3.5" />
                    Вариант
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    pollLocked && "opacity-60",
                  )}
                >
                  <Switch
                    checked={poll.allowMultiple}
                    disabled={pollLocked}
                    onCheckedChange={(checked) =>
                      setPoll((current) => ({
                        ...current,
                        allowMultiple: checked,
                      }))
                    }
                  />
                  Несколько вариантов
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Label
                    htmlFor="feed-poll-ends"
                    className="text-xs text-muted-foreground"
                  >
                    До
                  </Label>
                  {(() => {
                    const { date, time } = splitDatetime(poll.endsAt);
                    return (
                      <div className="grid grid-cols-[1.25fr_1fr] gap-2">
                        <DatePicker
                          id="feed-poll-ends"
                          value={date}
                          disabled={pollLocked}
                          onChange={(next) =>
                            setPoll((current) => ({
                              ...current,
                              endsAt: joinDatetime(next, time),
                            }))
                          }
                        />
                        <TimePicker
                          id="feed-poll-ends-time"
                          value={time}
                          disabled={pollLocked}
                          onChange={(next) =>
                            setPoll((current) => ({
                              ...current,
                              endsAt: joinDatetime(date, next),
                            }))
                          }
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          Отмена
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => void handleSubmit()}
        >
          {editing ? "Сохранить" : "Опубликовать"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
