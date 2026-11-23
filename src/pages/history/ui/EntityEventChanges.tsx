import { useState } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import {
  describeEntitySchemaChanges,
  parseEntityStructureRow,
  SchemaChangeList,
  useEntityConfig,
} from "@/entities/entity";
import {
  fetchEntityEventDefinitions,
  type EntityStructureEvent,
} from "@/entities/history";

function SchemaDetails({ event }: { event: EntityStructureEvent }) {
  const { id, entityId } = event;
  const { entities } = useEntityConfig();
  const result = useAsyncValue(async () => {
    const { before, after } = await fetchEntityEventDefinitions(id);
    const previous = parseEntityStructureRow({
      id: entityId,
      definition: before,
    });
    const current = parseEntityStructureRow({
      id: entityId,
      definition: after,
    });
    if (!previous || !current)
      throw new Error("Не удалось прочитать версию схемы");
    return describeEntitySchemaChanges(previous, current, entities);
  }, [id, entityId, entities]);

  if (result.status === "loading")
    return <p className="text-muted-foreground">Загрузка…</p>;
  if (result.status === "error")
    return (
      <p className="text-destructive">Не удалось загрузить историю изменений</p>
    );
  return result.value.length ? (
    <SchemaChangeList items={result.value} />
  ) : (
    <p className="text-muted-foreground">Нет подробностей</p>
  );
}

export function EntityEventChanges({ event }: { event: EntityStructureEvent }) {
  const [expanded, setExpanded] = useState(false);
  const labels = {
    insert: "Создание сущности",
    update: "Изменение структуры",
    delete: "Удаление сущности",
    publish: `Версия v${event.version}`,
  };
  return (
    <div className="space-y-1">
      {event.hasDetails ? (
        <details onToggle={(e) => setExpanded(e.currentTarget.open)}>
          <summary className="cursor-pointer text-primary">
            {labels[event.action]}
          </summary>
          {expanded && (
            <div className="mt-2">
              <SchemaDetails event={event} />
            </div>
          )}
        </details>
      ) : (
        <span>{labels[event.action]}</span>
      )}
      {event.message && (
        <p className="text-muted-foreground">{event.message}</p>
      )}
    </div>
  );
}
