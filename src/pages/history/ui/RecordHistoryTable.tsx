import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import {
  HistoryColumn,
  HistoryLoadMore,
  HistoryStatusRow,
} from "./HistoryTableControls";
import {
  getEntityDisplayName,
  getSystemUserNameByAuthId,
  isEntityNameField,
  RecordChangeList,
  resolveRelationRecordLabel,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
  type EntityValueContext,
} from "@/entities/entity";
import {
  useEntityRecordEvents,
  type EntityRecordEvent,
  type EntityRecordEventsQuery,
} from "@/entities/history";

/** Current title, or the stored name for deleted records. */
function recordTitle(
  ctx: EntityValueContext,
  entity: Entity | undefined,
  event: EntityRecordEvent,
  exists: boolean,
) {
  if (entity && exists) {
    return (
      resolveRelationRecordLabel(entity, event.recordId, undefined, ctx) ??
      "Без названия"
    );
  }
  const nameField = entity?.fields.find((field) => isEntityNameField(field));
  const change = nameField ? event.changes[nameField.id] : undefined;
  return change?.old?.trim() || change?.new?.trim() || "Удалённая запись";
}

export function RecordHistoryTable({
  query,
  onOpenRecord,
}: {
  query: EntityRecordEventsQuery;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const { entities } = useEntityConfig();
  const valueContext = useEntityValueContext();
  const { events, hasMore, status, error, loadingMore, loadMore } =
    useEntityRecordEvents(query);
  return (
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
            <HistoryColumn>Дата и время</HistoryColumn>
            <HistoryColumn>Пользователь</HistoryColumn>
            <HistoryColumn>Сущность</HistoryColumn>
            <HistoryColumn>Запись</HistoryColumn>
            <HistoryColumn>Изменения</HistoryColumn>
          </TableRow>
        </TableHeader>
        <TableBody>
          {status !== "ready" || events.length === 0 ? (
            <HistoryStatusRow status={status} error={error} colSpan={5} />
          ) : (
            events.map((event) => {
              const eventEntity = entities.find(
                (item) => item.id === event.entityId,
              );
              const exists = eventEntity
                ? Boolean(
                    valueContext.getRecord(eventEntity.id, event.recordId),
                  )
                : false;
              const title = recordTitle(
                valueContext,
                eventEntity,
                event,
                exists,
              );
              return (
                <TableRow key={event.id} className="border-border/60 align-top">
                  <TableCell className="px-3 py-2 text-muted-foreground tabular-nums">
                    {formatTimestampDisplay(event.createdAt)}
                  </TableCell>
                  <TableCell className="truncate px-3 py-2">
                    {getSystemUserNameByAuthId(entities, event.actorId) ??
                      (event.actorId ? "Пользователь" : "Система")}
                  </TableCell>
                  <TableCell className="truncate px-3 py-2 text-muted-foreground">
                    {eventEntity ? getEntityDisplayName(eventEntity) : "—"}
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
      {hasMore && <HistoryLoadMore loading={loadingMore} onClick={loadMore} />}
    </div>
  );
}
