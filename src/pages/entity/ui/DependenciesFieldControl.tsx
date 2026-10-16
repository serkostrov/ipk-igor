import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  createEntityDraftRecord,
  ENTITY_DEPENDENCY_TYPE_LABELS,
  ENTITY_DEPENDENCY_TYPES,
  getEntityFieldDisplayName,
  getRecordFieldIds,
  getRelationRecordOptions,
  parseEntityDependencies,
  parseEntityRelationIds,
  RelationSelect,
  serializeEntityDependencies,
  type Entity,
  type EntityDependency,
  type EntityDependencyType,
  type EntityField,
  type EntityValueContext,
} from "@/entities/entity";

type DependenciesFieldControlProps = {
  id: string;
  ctx: EntityValueContext;
  entity: Entity;
  field: EntityField;
  value: string;
  values: Record<string, string | undefined>;
  recordId: string;
  onChange: (value: string) => void;
};

function isDependencyType(value: unknown): value is EntityDependencyType {
  return ENTITY_DEPENDENCY_TYPES.includes(value as EntityDependencyType);
}

function LagInput({
  lag,
  onCommit,
}: {
  lag: number;
  onCommit: (lag: number) => void;
}) {
  const [text, setText] = useState(lag ? String(lag) : "");

  function commit() {
    const next = Math.round(Number(text.replace(",", ".")));
    onCommit(Number.isFinite(next) ? next : 0);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder="0"
      aria-label="Лаг, рабочих дней"
      className="h-9 px-2 text-center tabular-nums"
      onChange={(event) => setText(event.target.value.replace(/[^\d-]/g, ""))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

export function DependenciesFieldControl({
  id,
  ctx,
  entity,
  field,
  value,
  values,
  recordId,
  onChange,
}: DependenciesFieldControlProps) {
  const dependencies = parseEntityDependencies(value);
  const scopeField =
    entity.fields.find((item) => item.id === field.dependencies?.sameFieldId) ??
    null;
  const scopeIds = scopeField
    ? getRecordFieldIds(
        ctx,
        entity,
        createEntityDraftRecord(values, recordId),
        scopeField,
      )
    : [];
  const scopeMissing = scopeField != null && scopeIds.length === 0;
  const allOptions = getRelationRecordOptions(entity);
  const usedIds = new Set(dependencies.map((item) => item.recordId));
  const inScope = (candidateId: string) => {
    if (!scopeField) return true;
    const candidate = entity.records.find((item) => item.id === candidateId);
    return candidate
      ? getRecordFieldIds(ctx, entity, candidate, scopeField).some((itemId) =>
          scopeIds.includes(itemId),
        )
      : false;
  };
  const available = scopeMissing
    ? []
    : allOptions.filter(
        (option) =>
          option.id !== recordId &&
          !usedIds.has(option.id) &&
          inScope(option.id),
      );

  function commit(next: EntityDependency[]) {
    onChange(serializeEntityDependencies(next));
  }

  function update(recordIdToUpdate: string, patch: Partial<EntityDependency>) {
    commit(
      dependencies.map((item) =>
        item.recordId === recordIdToUpdate ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {dependencies.length > 0 ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4rem_2rem] gap-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">
            <span>Запись</span>
            <span>Связь</span>
            <span className="text-center">Лаг, р.д.</span>
            <span />
          </div>
          {dependencies.map((dependency) => {
            const label =
              allOptions.find((option) => option.id === dependency.recordId)
                ?.label ?? "Удалённая запись";
            const kind = ENTITY_DEPENDENCY_TYPE_LABELS[dependency.type];
            return (
              <div
                key={dependency.recordId}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem_4rem_2rem] items-center gap-1.5"
              >
                <span
                  className="flex h-9 min-w-0 items-center rounded-md border border-border/70 bg-muted/30 px-2.5 text-sm"
                  title={label}
                >
                  <span className="truncate">{label}</span>
                </span>
                <Select
                  value={dependency.type}
                  onValueChange={(next) => {
                    if (isDependencyType(next)) {
                      update(dependency.recordId, { type: next });
                    }
                  }}
                >
                  <SelectTrigger
                    className="h-9 w-full px-2"
                    aria-label="Тип связи"
                    title={kind.label}
                  >
                    <SelectValue>{kind.short}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_DEPENDENCY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        <span className="w-7 font-medium">
                          {ENTITY_DEPENDENCY_TYPE_LABELS[type].short}
                        </span>
                        <span className="text-muted-foreground">
                          {ENTITY_DEPENDENCY_TYPE_LABELS[type].label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <LagInput
                  key={dependency.lag}
                  lag={dependency.lag}
                  onCommit={(lag) => update(dependency.recordId, { lag })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Убрать «${label}»`}
                  onClick={() =>
                    commit(
                      dependencies.filter(
                        (item) => item.recordId !== dependency.recordId,
                      ),
                    )
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </>
      ) : null}
      <RelationSelect
        id={id}
        options={available}
        value=""
        disabled={scopeMissing}
        placeholder={
          scopeMissing && scopeField
            ? `Сначала выберите «${getEntityFieldDisplayName(scopeField)}»`
            : "Добавить предшественника"
        }
        onChange={(next) => {
          const [nextId] = parseEntityRelationIds(next);
          if (!nextId) return;
          commit([...dependencies, { recordId: nextId, type: "FS", lag: 0 }]);
        }}
      />
    </div>
  );
}
