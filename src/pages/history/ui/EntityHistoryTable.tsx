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
import { useEntityConfig, getSystemUserNameByAuthId } from "@/entities/entity";
import { useEntityEvents, type EntityEventsQuery } from "@/entities/history";
import { EntityEventChanges } from "./EntityEventChanges";

export function EntityHistoryTable({ query }: { query: EntityEventsQuery }) {
  const { entities } = useEntityConfig();
  const { events, hasMore, status, error, loadingMore, loadMore } =
    useEntityEvents(query);
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card shadow-xs">
      <Table className="table-fixed text-[13px]">
        <colgroup>
          <col className="w-36" />
          <col className="w-44" />
          <col className="w-40" />
          <col />
        </colgroup>
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="border-0 hover:bg-transparent">
            <HistoryColumn>Дата и время</HistoryColumn>
            <HistoryColumn>Пользователь</HistoryColumn>
            <HistoryColumn>Сущность</HistoryColumn>
            <HistoryColumn>Изменения</HistoryColumn>
          </TableRow>
        </TableHeader>
        <TableBody>
          {status !== "ready" || events.length === 0 ? (
            <HistoryStatusRow status={status} error={error} colSpan={4} />
          ) : (
            events.map((event) => (
              <TableRow key={event.id} className="border-border/60 align-top">
                <TableCell className="px-3 py-2 text-muted-foreground tabular-nums">
                  {formatTimestampDisplay(event.createdAt)}
                </TableCell>
                <TableCell className="truncate px-3 py-2">
                  {getSystemUserNameByAuthId(entities, event.actorId) ??
                    (event.actorId ? "Пользователь" : "Система")}
                </TableCell>
                <TableCell className="truncate px-3 py-2 text-muted-foreground">
                  {event.entityName}
                </TableCell>
                <TableCell className="px-3 py-2 whitespace-normal">
                  <EntityEventChanges event={event} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {hasMore && <HistoryLoadMore loading={loadingMore} onClick={loadMore} />}
    </div>
  );
}
