import { useAsyncValue } from "@/shared/hooks/use-async-value";
import {
  canEntity,
  filterVisibleEntityRecords,
  useCurrentRole,
} from "@/entities/access";
import { getSessionUser } from "@/entities/session";
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
  getCurrentUserRecordId,
  getEntityDisplayName,
  getEntityRecordById,
  isEntityNameField,
  RecordChangeList,
  useEntityConfig,
  useEntityValueContext,
  type Entity,
} from "@/entities/entity";
import {
  useEntityRecordEvents,
  type EntityRecordEvent,
  type EntityRecordEventsQuery,
  type HistoryLabels,
} from "@/entities/history";

/** Server-resolved title (present → record exists), else the stored name of a
 * deleted record from the diff. */
function recordTitle(
  entity: Entity | undefined,
  event: EntityRecordEvent,
  labels: HistoryLabels,
  exists: boolean,
) {
  if (exists) return labels[event.recordId] ?? "Без названия";
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
  const role = useCurrentRole();
  const { events, hasMore, status, error, loadingMore, loadMore, labels } =
    useEntityRecordEvents(query);
  const visibleEvents = useAsyncValue(async () => {
    const authUserId = getSessionUser()?.id ?? null;
    const currentUserRecordId = getCurrentUserRecordId();
    const kept = [];
    for (const event of events) {
      const eventEntity = entities.find((item) => item.id === event.entityId);
      if (!eventEntity || !canEntity(role, eventEntity.id, "read")) continue;
      const record = await getEntityRecordById(eventEntity, event.recordId);
      if (!record) {
        if (event.action === "delete") kept.push(event);
        continue;
      }
      const visible = await filterVisibleEntityRecords(
        role,
        eventEntity,
        [record],
        {
          entities,
          authUserId,
          currentUserRecordId,
          valueContext,
        },
      );
      if (visible.length > 0) kept.push(event);
    }
    return kept;
  }, [entities, events, role, valueContext]);
  if (visibleEvents.status === "error") throw visibleEvents.error;
  const rows = visibleEvents.status === "ready" ? visibleEvents.value : [];
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
          {status !== "ready" ||
          visibleEvents.status !== "ready" ||
          rows.length === 0 ? (
            <HistoryStatusRow
              status={
                status === "error"
                  ? status
                  : status !== "ready" || visibleEvents.status !== "ready"
                    ? "loading"
                    : status
              }
              error={error}
              colSpan={5}
            />
          ) : (
            rows.map((event) => {
              const eventEntity = entities.find(
                (item) => item.id === event.entityId,
              );
              const exists = Boolean(eventEntity) && event.recordId in labels;
              const title = recordTitle(eventEntity, event, labels, exists);
              return (
                <TableRow key={event.id} className="border-border/60 align-top">
                  <TableCell className="px-3 py-2 text-muted-foreground tabular-nums">
                    {formatTimestampDisplay(event.createdAt)}
                  </TableCell>
                  <TableCell className="truncate px-3 py-2">
                    {(event.actorId ? labels[event.actorId] : undefined) ??
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
                        labels={labels}
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
