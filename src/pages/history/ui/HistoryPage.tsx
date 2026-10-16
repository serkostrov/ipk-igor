import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { DatePicker } from "@/shared/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { addCalendarDays, todayIsoDate } from "@/shared/lib/business-days";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import {
  getRelationRecordOptions,
  getSystemUserNameByAuthId,
  getSystemUsersEntity,
  isEntityNameField,
  RecordChangeList,
  RelationSelect,
  resolveRelationRecordLabel,
  serializeEntityRelationIds,
  parseEntityRelationIds,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
} from "@/entities/entity";
import {
  useEntityRecordEvents,
  type EntityRecordEvent,
} from "@/entities/history";

const ALL = "__all__";

const headClass =
  "h-9 border-b border-border bg-foreground/[0.045] px-3 text-[11px] font-semibold tracking-wide text-foreground/65 uppercase";

function entityLabel(entity: Entity) {
  return entity.namePlural.trim() || entity.name.trim() || "Без названия";
}

/** Current title, or the stored name for deleted records. */
function recordTitle(entity: Entity | undefined, event: EntityRecordEvent) {
  const exists = entity?.records.some((record) => record.id === event.recordId);
  if (entity && exists) {
    return resolveRelationRecordLabel(entity, event.recordId) ?? "Без названия";
  }
  const nameField = entity?.fields.find((field) => isEntityNameField(field));
  const change = nameField ? event.changes[nameField.id] : undefined;
  return change?.old?.trim() || change?.new?.trim() || "Удалённая запись";
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.id === value);
  return (
    <Select
      value={value || ALL}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(String(next) === ALL ? "" : String(next));
      }}
    >
      <SelectTrigger className="h-9 w-48" aria-label={label}>
        <SelectValue>
          <span className="truncate">
            <span className="text-muted-foreground">{label}:</span>{" "}
            {selected?.label ?? "все"}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Все</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type HistoryPageProps = {
  onOpenRecord?: (entityId: string, recordId: string) => void;
};

export function HistoryPage({ onOpenRecord }: HistoryPageProps) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const today = todayIsoDate();
  const [from, setFrom] = useState(() => addCalendarDays(today, -30));
  const [to, setTo] = useState(today);
  const [userRecordId, setUserRecordId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [recordId, setRecordId] = useState("");

  const users = getSystemUsersEntity(entities);
  const actorId =
    users?.records.find((record) => record.id === userRecordId)?.authUserId ??
    undefined;
  const entity = entities.find((item) => item.id === entityId);
  const { events, hasMore, status, error, loadingMore, loadMore } =
    useEntityRecordEvents({
      from,
      to,
      actorId,
      entityId: entityId || undefined,
      recordId: recordId || undefined,
    });
  const hasFilters = Boolean(userRecordId || entityId || recordId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-8">
      <div className="flex shrink-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          История изменений
        </h1>
        <p className="text-sm text-muted-foreground">
          Кто, когда и что поменял в записях.
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <DatePicker
            value={from}
            placeholder="С"
            aria-label="С даты"
            className="h-9 w-[8.5rem]"
            onChange={setFrom}
          />
          <span className="text-xs text-muted-foreground" aria-hidden>
            —
          </span>
          <DatePicker
            value={to}
            placeholder="По"
            aria-label="По дату"
            className="h-9 w-[8.5rem]"
            onChange={setTo}
          />
        </div>
        <FilterSelect
          label="Пользователь"
          value={userRecordId}
          options={getRelationRecordOptions(users)}
          onChange={setUserRecordId}
        />
        <FilterSelect
          label="Сущность"
          value={entityId}
          options={entities
            .map((item) => ({ id: item.id, label: entityLabel(item) }))
            .sort((a, b) => a.label.localeCompare(b.label, "ru"))}
          onChange={(next) => {
            setEntityId(next);
            setRecordId("");
          }}
        />
        {entity ? (
          <RelationSelect
            options={getRelationRecordOptions(entity)}
            value={recordId ? serializeEntityRelationIds([recordId]) : ""}
            placeholder="Любая запись"
            aria-label="Запись"
            className="h-9 w-56"
            onChange={(next) =>
              setRecordId(parseEntityRelationIds(next)[0] ?? "")
            }
          />
        ) : null}
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setUserRecordId("");
              setEntityId("");
              setRecordId("");
            }}
          >
            <X />
            Сбросить
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs">
        <Table className="table-fixed text-[13px]">
          <colgroup>
            <col className="w-36" />
            <col className="w-44" />
            <col className="w-40" />
            <col className="w-56" />
            <col />
          </colgroup>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className={headClass}>Дата и время</TableHead>
              <TableHead className={headClass}>Пользователь</TableHead>
              <TableHead className={headClass}>Сущность</TableHead>
              <TableHead className={headClass}>Запись</TableHead>
              <TableHead className={headClass}>Изменения</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status === "loading" ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  Загрузка…
                </TableCell>
              </TableRow>
            ) : status === "error" ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-destructive"
                >
                  Не удалось загрузить историю: {error}
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  Изменений за период нет
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => {
                const eventEntity = entities.find(
                  (item) => item.id === event.entityId,
                );
                const exists = eventEntity?.records.some(
                  (record) => record.id === event.recordId,
                );
                const title = recordTitle(eventEntity, event);
                return (
                  <TableRow
                    key={event.id}
                    className="border-border/60 align-top"
                  >
                    <TableCell className="px-3 py-2 text-muted-foreground tabular-nums">
                      {formatTimestampDisplay(event.createdAt)}
                    </TableCell>
                    <TableCell className="truncate px-3 py-2">
                      {getSystemUserNameByAuthId(entities, event.actorId) ??
                        (event.actorId ? "Пользователь" : "Система")}
                    </TableCell>
                    <TableCell className="truncate px-3 py-2 text-muted-foreground">
                      {eventEntity ? entityLabel(eventEntity) : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {exists && eventEntity ? (
                        <button
                          type="button"
                          className="max-w-full truncate text-left font-medium text-primary underline-offset-2 hover:underline"
                          title={title}
                          onClick={() =>
                            onOpenRecord?.(eventEntity.id, event.recordId)
                          }
                        >
                          {title}
                        </button>
                      ) : (
                        <span
                          className="block truncate text-muted-foreground"
                          title={title}
                        >
                          {title}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 whitespace-normal">
                      {event.action === "update" && eventEntity ? (
                        <RecordChangeList
                          ctx={valueContext}
                          entity={eventEntity}
                          changes={event.changes}
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          {event.action === "insert"
                            ? "Создание записи"
                            : event.action === "delete"
                              ? "Удаление записи"
                              : "Изменение"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {hasMore ? (
          <div className="flex justify-center border-t border-border p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Загрузка…" : "Показать ещё"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
