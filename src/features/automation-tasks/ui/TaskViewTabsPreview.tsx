import { useMemo, useState, type ReactNode } from "react";
import {
  ClipboardPen,
  FileText,
  Folder,
  History,
  StickyNote,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

const PREVIEW_LIMIT = 12;
const FILL_TAB_ID = "__fill__";

type TaskViewTabsPreviewProps = {
  entity: Entity;
  record: EntityRecord;
  tabIds: string[];
  /** When set, adds a leading «Заполнить» tab with this content. */
  fillSlot?: ReactNode;
  /** Optional badge on the fill tab (e.g. remaining required count). */
  fillBadge?: ReactNode;
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
      <p className="py-6 text-center text-sm text-muted-foreground">
        Записей пока нет
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {shown.map((entry) => {
        const author = getSystemUserName(entities, entry.authorId);
        return (
          <li
            key={entry.id}
            className="rounded-lg border border-border/60 bg-background px-3 py-2.5"
          >
            <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-snug text-foreground">
              {entry.text}
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {author ?? "Без автора"}
              {" · "}
              {formatTimestampDisplay(entry.createdAt)}
            </p>
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="text-center text-[11px] text-muted-foreground">
          и ещё {rest}
        </li>
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
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Файлов пока нет
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
        >
          {entry.kind === "folder" ? (
            <Folder
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <FileText
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          <span className="min-w-0 truncate font-medium text-foreground">
            {entry.name}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {entry.kind === "folder" ? "папка" : "файл"}
          </span>
        </li>
      ))}
      {rest > 0 ? (
        <li className="text-center text-[11px] text-muted-foreground">
          и ещё {rest}
        </li>
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
      <p className="py-6 text-center text-sm text-muted-foreground">
        Загрузка истории…
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Событий пока нет
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {shown.map((event) => {
        const actor =
          getSystemUserNameByAuthId(entities, event.actorId) ??
          (event.actorId ? "Пользователь" : "Система");
        return (
          <li
            key={event.id}
            className="rounded-lg border border-border/60 bg-background px-3 py-2.5"
          >
            <p className="text-[11px] text-muted-foreground">
              {actor}
              {" · "}
              {formatTimestampDisplay(event.createdAt)}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-foreground">
              {historyActionLabel(entity, event.action, event.changes)}
            </p>
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="text-center text-[11px] text-muted-foreground">
          и ещё {rest}
        </li>
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
    <p className="py-6 text-center text-sm text-muted-foreground">
      Этот тип вкладки откройте на карточке
    </p>
  );
}

/**
 * Task form shell: «Заполнить» + read-only card tabs from «Просмотреть вкладки».
 * Switches via tabs when view tabs (or fill + view tabs) are configured.
 */
export function TaskViewTabsPreview({
  entity,
  record,
  tabIds,
  fillSlot,
  fillBadge,
  className,
}: TaskViewTabsPreviewProps) {
  const viewTabs = useMemo(
    () =>
      tabIds
        .map((id) => entity.tabs.find((tab) => tab.id === id))
        .filter((tab): tab is EntityTab => tab != null),
    [entity.tabs, tabIds],
  );

  const hasFill = fillSlot != null;
  const defaultTab = hasFill ? FILL_TAB_ID : (viewTabs[0]?.id ?? FILL_TAB_ID);
  const [tab, setTab] = useState(defaultTab);

  // Only fill, no view tabs — render form as-is.
  if (viewTabs.length === 0) {
    return fillSlot ? <>{fillSlot}</> : null;
  }

  // Single view tab and no fill — still use a clean panel (no lonely tab chrome).
  if (!hasFill && viewTabs.length === 1) {
    const only = viewTabs[0]!;
    return (
      <div
        className={cn(
          "flex min-h-0 flex-col gap-3 rounded-xl border border-border/70 bg-card",
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <span className="text-muted-foreground">
            <TabKindIcon tab={only} />
          </span>
          <p className="truncate text-sm font-medium">
            {only.name.trim() || "Вкладка"}
          </p>
          <span className="ml-auto text-[10px] tracking-wide text-muted-foreground uppercase">
            просмотр
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <TabPreviewBody entity={entity} record={record} tab={only} />
        </div>
      </div>
    );
  }

  const active = viewTabs.some((item) => item.id === tab)
    ? tab
    : hasFill
      ? FILL_TAB_ID
      : (viewTabs[0]?.id ?? FILL_TAB_ID);

  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        if (typeof next === "string" && next) setTab(next);
      }}
      className={cn(
        "flex min-h-0 flex-col gap-0 rounded-xl border border-border/70 bg-card",
        className,
      )}
    >
      <div className="shrink-0 border-b border-border/70 px-2 pt-2">
        <TabsList
          variant="line"
          className="h-9 w-full justify-start gap-3 overflow-x-auto"
        >
          {hasFill ? (
            <TabsTrigger
              value={FILL_TAB_ID}
              className="gap-1.5 px-0 text-xs data-active:text-foreground"
            >
              <ClipboardPen className="size-3.5" aria-hidden />
              Заполнить
              {fillBadge}
            </TabsTrigger>
          ) : null}
          {viewTabs.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="gap-1.5 px-0 text-xs data-active:text-foreground"
            >
              <TabKindIcon tab={item} />
              <span className="max-w-[10rem] truncate">
                {item.name.trim() || "Вкладка"}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {hasFill ? (
        <TabsContent
          value={FILL_TAB_ID}
          className="mt-0 min-h-0 flex-1 overflow-y-auto px-3 py-3"
        >
          {fillSlot}
        </TabsContent>
      ) : null}

      {viewTabs.map((item) => (
        <TabsContent
          key={item.id}
          value={item.id}
          className="mt-0 min-h-0 flex-1 overflow-y-auto px-3 py-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              Контекст с карточки — только просмотр
            </p>
          </div>
          <TabPreviewBody entity={entity} record={record} tab={item} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
