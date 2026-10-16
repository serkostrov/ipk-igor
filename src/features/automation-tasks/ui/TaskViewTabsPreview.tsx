import { useMemo } from "react";
import { FileText, Folder, History, StickyNote } from "lucide-react";
import {
  getEntityFieldDisplayName,
  getEntityTabFilesValueKey,
  getEntityTabRecordsValueKey,
  getSystemUserName,
  getSystemUserNameByAuthId,
  isEntityFilesTab,
  isEntityHistoryTab,
  isEntityRecordsTab,
  parseEntityTabFileEntries,
  parseEntityTabRecordEntries,
  useEntityConfig,
  type Entity,
  type EntityRecord,
  type EntityTab,
} from "@/entities/entity";
import { useEntityRecordEvents } from "@/entities/history";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";

const PREVIEW_LIMIT = 5;

type TaskViewTabsPreviewProps = {
  entity: Entity;
  record: EntityRecord;
  tabIds: string[];
  className?: string;
};

function TabKindIcon({ tab }: { tab: EntityTab }) {
  if (isEntityFilesTab(tab)) return <Folder className="size-3.5" aria-hidden />;
  if (isEntityHistoryTab(tab))
    return <History className="size-3.5" aria-hidden />;
  return <StickyNote className="size-3.5" aria-hidden />;
}

function RecordsPreview({
  record,
  tab,
}: {
  record: EntityRecord;
  tab: EntityTab;
}) {
  const { entities } = useEntityConfig();
  const entries = useMemo(() => {
    const key = getEntityTabRecordsValueKey(tab.id);
    return parseEntityTabRecordEntries(record.values[key]);
  }, [record.values, tab.id]);
  const shown = entries.slice(0, PREVIEW_LIMIT);
  const rest = entries.length - shown.length;

  if (entries.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">Записей пока нет</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((entry) => {
        const author = getSystemUserName(entities, entry.authorId);
        return (
          <li
            key={entry.id}
            className="rounded-md border border-border/50 bg-background/80 px-2.5 py-2"
          >
            <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-snug text-foreground">
              {entry.text}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {author ?? "Без автора"}
              {" · "}
              {formatTimestampDisplay(entry.createdAt)}
            </p>
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="text-[10px] text-muted-foreground">и ещё {rest}</li>
      ) : null}
    </ul>
  );
}

function FilesPreview({
  record,
  tab,
}: {
  record: EntityRecord;
  tab: EntityTab;
}) {
  const entries = useMemo(() => {
    const key = getEntityTabFilesValueKey(tab.id);
    return parseEntityTabFileEntries(record.values[key]);
  }, [record.values, tab.id]);

  const root = useMemo(
    () =>
      entries
        .filter((entry) => entry.parentId == null)
        .slice()
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name, "ru");
        }),
    [entries],
  );
  const shown = root.slice(0, PREVIEW_LIMIT);
  const rest = root.length - shown.length;

  if (root.length === 0) {
    return <p className="text-[11px] text-muted-foreground">Файлов пока нет</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {shown.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center gap-2 rounded-md border border-border/50 bg-background/80 px-2.5 py-1.5 text-xs"
        >
          {entry.kind === "folder" ? (
            <Folder
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <FileText
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          <span className="min-w-0 truncate text-foreground">{entry.name}</span>
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {entry.kind === "folder" ? "папка" : "файл"}
          </span>
        </li>
      ))}
      {rest > 0 ? (
        <li className="text-[10px] text-muted-foreground">и ещё {rest}</li>
      ) : null}
    </ul>
  );
}

function historyActionLabel(
  entity: Entity,
  action: "insert" | "update" | "delete",
  changes: Record<string, { old: string | null; new: string | null }>,
) {
  if (action === "insert") return "Создание записи";
  if (action === "delete") return "Удаление записи";
  const fieldIds = Object.keys(changes).filter((key) =>
    entity.fields.some((field) => field.id === key),
  );
  if (fieldIds.length === 0) {
    const count = Object.keys(changes).length;
    return count > 0 ? `Изменено: ${count}` : "Изменение записи";
  }
  const names = fieldIds.slice(0, 2).map((id) => {
    const field = entity.fields.find((item) => item.id === id);
    return field ? getEntityFieldDisplayName(field) : id;
  });
  const extra = fieldIds.length - names.length;
  return `Изменено: ${names.join(", ")}${extra > 0 ? ` · +${extra}` : ""}`;
}

function HistoryPreview({
  entity,
  record,
}: {
  entity: Entity;
  record: EntityRecord;
}) {
  const { entities } = useEntityConfig();
  const { events, status } = useEntityRecordEvents({ recordId: record.id });
  const shown = events.slice(0, PREVIEW_LIMIT);
  const rest = events.length - shown.length;

  if (status === "loading" && events.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">Загрузка истории…</p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">Событий пока нет</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((event) => {
        const actor =
          getSystemUserNameByAuthId(entities, event.actorId) ??
          (event.actorId ? "Пользователь" : "Система");
        return (
          <li
            key={event.id}
            className="rounded-md border border-border/50 bg-background/80 px-2.5 py-2"
          >
            <p className="text-[10px] text-muted-foreground">
              {actor}
              {" · "}
              {formatTimestampDisplay(event.createdAt)}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-foreground">
              {historyActionLabel(entity, event.action, event.changes)}
            </p>
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="text-[10px] text-muted-foreground">и ещё {rest}</li>
      ) : null}
    </ul>
  );
}

function TabPreviewBody({
  entity,
  record,
  tab,
}: {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
}) {
  if (isEntityRecordsTab(tab)) {
    return <RecordsPreview record={record} tab={tab} />;
  }
  if (isEntityFilesTab(tab)) {
    return <FilesPreview record={record} tab={tab} />;
  }
  if (isEntityHistoryTab(tab)) {
    return <HistoryPreview entity={entity} record={record} />;
  }
  return (
    <p className="text-[11px] text-muted-foreground">
      Этот тип вкладки откройте на карточке
    </p>
  );
}

/** Read-only tab snapshots on the automation task form. */
export function TaskViewTabsPreview({
  entity,
  record,
  tabIds,
  className,
}: TaskViewTabsPreviewProps) {
  const tabs = tabIds
    .map((id) => entity.tabs.find((tab) => tab.id === id))
    .filter((tab): tab is EntityTab => tab != null);

  if (tabs.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-border/70 bg-muted/15 px-3 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Вкладки
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Контекст с карточки — только просмотр
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        {tabs.map((tab) => (
          <section
            key={tab.id}
            className="rounded-lg border border-border/50 bg-background/70 px-2.5 py-2.5"
          >
            <header className="mb-2 flex items-center gap-1.5 text-muted-foreground">
              <TabKindIcon tab={tab} />
              <h4 className="min-w-0 truncate text-[11px] font-medium text-foreground">
                {tab.name.trim() || "Вкладка"}
              </h4>
            </header>
            <TabPreviewBody entity={entity} record={record} tab={tab} />
          </section>
        ))}
      </div>
    </div>
  );
}
