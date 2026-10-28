import { useEffect, useMemo, useState } from "react";
import { GitBranch, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/cn";
import { addCalendarDays, todayIsoDate } from "@/shared/lib/business-days";
import {
  formatDateDisplay,
  getLocalTimestampParts,
} from "@/shared/lib/format-date";
import { getPersonInitials } from "@/shared/lib/person";
import {
  describeEntitySchemaChanges,
  entityHasUnpublishedSchemaChanges,
  getCachedEntitySchemaVersion,
  getSystemUserNameByAuthId,
  loadEntitySchemaVersions,
  publishEntitySchemaVersion,
  restoreEntitySchemaVersionToDraft,
  SchemaChangeList,
  useEntityValueContext,
  type Entity,
  type EntitySchemaVersion,
} from "@/entities/entity";

type EntitySchemaHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: Entity;
  /** After restore into draft — parent should enter edit mode if needed. */
  onRestoredToDraft?: () => void;
};

function dayLabel(day: string, today: string) {
  if (day === today) return "Сегодня";
  if (day === addCalendarDays(today, -1)) return "Вчера";
  return formatDateDisplay(day);
}

function groupByDay(versions: EntitySchemaVersion[]) {
  const groups = new Map<string, EntitySchemaVersion[]>();
  for (const version of versions) {
    const day = getLocalTimestampParts(version.createdAt)?.date ?? "";
    const list = groups.get(day) ?? [];
    list.push(version);
    groups.set(day, list);
  }
  return [...groups.entries()];
}

export function EntitySchemaHistoryDialog({
  open,
  onOpenChange,
  entity,
  onRestoredToDraft,
}: EntitySchemaHistoryDialogProps) {
  const ctx = useEntityValueContext();
  const [versions, setVersions] = useState<EntitySchemaVersion[] | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [publishing, setPublishing] = useState(false);
  const loading = open && versions == null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void loadEntitySchemaVersions(entity.id)
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setSelectedVersion(list[0]?.version ?? null);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) {
          toast.error("Не удалось загрузить историю версий");
          setVersions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, entity.id, entity.publishedVersion]);

  const versionList = useMemo(() => versions ?? [], [versions]);

  const published = useMemo(
    () =>
      versionList.find((item) => item.version === entity.publishedVersion) ??
      null,
    [versionList, entity.publishedVersion],
  );

  const draftDirty = entityHasUnpublishedSchemaChanges(
    entity,
    published?.definition ??
      getCachedEntitySchemaVersion(entity.id, entity.publishedVersion),
  );

  const selected = versionList.find((item) => item.version === selectedVersion);
  const previous = useMemo(() => {
    if (!selected) return null;
    return (
      versionList.find((item) => item.version === selected.version - 1) ?? null
    );
  }, [selected, versionList]);

  const diffItems = useMemo(() => {
    if (!selected || !previous) return [];
    return describeEntitySchemaChanges(
      previous.definition,
      selected.definition,
    );
  }, [selected, previous]);

  const draftDiffItems = useMemo(() => {
    if (!published) return [];
    return describeEntitySchemaChanges(published.definition, entity);
  }, [published, entity]);

  const today = todayIsoDate();
  const groups = groupByDay(versionList);

  async function handlePublish() {
    setPublishing(true);
    try {
      const result = await publishEntitySchemaVersion(
        entity.id,
        publishMessage,
      );
      if (!result.ok) {
        if (result.reason === "empty_message") {
          toast.error("Укажите сообщение версии");
        } else if (result.reason === "unchanged") {
          toast.message("Нет изменений относительно текущей версии");
        } else {
          toast.error("Не удалось создать версию");
        }
        return;
      }
      toast.success(`Опубликована версия v${result.version.version}`);
      setPublishMessage("");
      setPublishOpen(false);
      setVersions(null);
      const list = await loadEntitySchemaVersions(entity.id);
      setVersions(list);
      setSelectedVersion(result.version.version);
    } finally {
      setPublishing(false);
    }
  }

  function handleRestore(version: EntitySchemaVersion) {
    const ok = restoreEntitySchemaVersionToDraft(entity.id, version.version);
    if (!ok) {
      toast.error("Не удалось восстановить версию");
      return;
    }
    toast.message(
      `Черновик из v${version.version}. Зафиксируйте новой версией.`,
    );
    onRestoredToDraft?.();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setVersions(null);
            setSelectedVersion(null);
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-border pb-4">
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4 text-muted-foreground" aria-hidden />
              Версии схемы
            </DialogTitle>
            <DialogDescription>
              Записи остаются на версии, с которой созданы. Новые записи
              получают текущую опубликованную версию (v{entity.publishedVersion}
              ).
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-4 sm:flex-row">
            <div className="flex min-h-0 w-full shrink-0 flex-col gap-2 sm:w-56">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  История
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={draftDirty ? "default" : "outline"}
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={!draftDirty}
                  title={
                    draftDirty
                      ? "Зафиксировать черновик как новую версию"
                      : "Черновик совпадает с текущей версией"
                  }
                  onClick={() => setPublishOpen(true)}
                >
                  <GitBranch className="size-3.5" aria-hidden />
                  Создать
                </Button>
              </div>

              {draftDirty ? (
                <button
                  type="button"
                  className={cn(
                    "rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2.5 py-2 text-left text-xs transition-colors",
                    selectedVersion == null && "ring-1 ring-primary/30",
                  )}
                  onClick={() => setSelectedVersion(null)}
                >
                  <span className="font-medium text-foreground">Черновик</span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Незафиксированные изменения
                  </span>
                </button>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {loading ? (
                  <div className="space-y-2">
                    <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
                    <div className="h-14 animate-pulse rounded-lg bg-muted/40" />
                  </div>
                ) : versionList.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    Версий пока нет
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {groups.map(([day, dayVersions]) => (
                      <li
                        key={day || "unknown"}
                        className="flex flex-col gap-1"
                      >
                        <p className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          {day ? dayLabel(day, today) : "Без даты"}
                        </p>
                        <ul className="flex flex-col gap-1">
                          {dayVersions.map((version) => {
                            const name =
                              getSystemUserNameByAuthId(
                                ctx.entities,
                                version.actorId,
                              ) ??
                              (version.actorId ? "Пользователь" : "Система");
                            const time =
                              getLocalTimestampParts(version.createdAt)?.time ??
                              "";
                            const active = selectedVersion === version.version;
                            const isCurrent =
                              version.version === entity.publishedVersion;
                            return (
                              <li key={version.id}>
                                <button
                                  type="button"
                                  className={cn(
                                    "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                                    active
                                      ? "bg-primary/10"
                                      : "hover:bg-muted/40",
                                  )}
                                  onClick={() =>
                                    setSelectedVersion(version.version)
                                  }
                                >
                                  <span
                                    aria-hidden
                                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                                  >
                                    {getPersonInitials(name)}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium tabular-nums">
                                        v{version.version}
                                      </span>
                                      {isCurrent ? (
                                        <span className="rounded bg-primary/15 px-1 py-px text-[10px] font-medium text-primary">
                                          текущая
                                        </span>
                                      ) : null}
                                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                                        {time}
                                      </span>
                                    </span>
                                    <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                      {version.message || "Без сообщения"}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card/40 p-4">
              {selectedVersion == null && draftDirty ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Черновик относительно v{entity.publishedVersion}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Эти изменения ещё не влияют на новые записи — зафиксируйте
                      версию.
                    </p>
                  </div>
                  <SchemaChangeList items={draftDiffItems} />
                </div>
              ) : selected ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">
                        v{selected.version}
                        {previous ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            ← v{previous.version}
                          </span>
                        ) : null}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selected.message || "Без сообщения"}
                      </p>
                    </div>
                    {selected.version !== entity.publishedVersion ||
                    draftDirty ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1.5"
                        onClick={() => handleRestore(selected)}
                      >
                        <RotateCcw className="size-3.5" aria-hidden />В черновик
                      </Button>
                    ) : null}
                  </div>
                  <SchemaChangeList
                    items={
                      previous
                        ? diffItems
                        : [
                            {
                              key: "initial",
                              label: "Создание",
                              before: null,
                              after: selected.message || "Начальная версия",
                            },
                          ]
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Выберите версию слева
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Создать версию схемы</DialogTitle>
            <DialogDescription>
              Новые записи будут создаваться на v{entity.publishedVersion + 1}.
              Уже существующие записи останутся на своих версиях.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="schema-version-message">Сообщение</Label>
              <Input
                id="schema-version-message"
                value={publishMessage}
                onChange={(event) => setPublishMessage(event.target.value)}
                placeholder="Например, обновил формулу маржи"
                autoFocus
              />
            </div>
            {draftDiffItems.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Изменения
                </p>
                <SchemaChangeList items={draftDiffItems} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={publishing}
              onClick={() => setPublishOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={publishing || !publishMessage.trim()}
              onClick={() => void handlePublish()}
            >
              Опубликовать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact published-version chip for entity settings header. */
export function EntityPublishedVersionBadge({
  entity,
  onClick,
}: {
  entity: Entity;
  onClick?: () => void;
}) {
  const published = getCachedEntitySchemaVersion(
    entity.id,
    entity.publishedVersion,
  );
  const dirty = entityHasUnpublishedSchemaChanges(entity, published);

  return (
    <button
      type="button"
      onClick={onClick}
      title="История версий схемы"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      )}
    >
      <History className="size-3 shrink-0" aria-hidden />v
      {entity.publishedVersion}
      {dirty ? (
        <span
          className="size-1.5 rounded-full bg-amber-500"
          title="Есть черновик"
        />
      ) : null}
    </button>
  );
}
