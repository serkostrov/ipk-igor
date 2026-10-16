import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  normalizeEntityTabKind,
  type EntityRecordColumns,
  type EntityRecordsDisplay,
  type EntityTabKind,
} from "@/entities/entity";
import { EntityRecordsDisplayFields } from "./EntityRecordsDisplayFields";

export type EntityTabEntitySource = "new" | "existing";

export type EntityTabFormPayload = {
  name: string;
  kind: EntityTabKind;
  entitySource?: EntityTabEntitySource;
  linkedEntityId?: string;
  recordsDisplay?: EntityRecordsDisplay;
  recordColumns?: EntityRecordColumns;
};

export type EntityTabEntityOption = {
  id: string;
  name: string;
  recordsDisplay?: EntityRecordsDisplay;
  recordColumns?: EntityRecordColumns;
};

type EntityTabDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialKind?: EntityTabKind;
  mode?: "create" | "edit";
  entityOptions?: EntityTabEntityOption[];
  onSubmit: (data: EntityTabFormPayload) => void;
};

const DEFAULT_RECORDS_DISPLAY: EntityRecordsDisplay = "cards";
const DEFAULT_RECORD_COLUMNS: EntityRecordColumns = 2;

const TAB_KIND_LABELS: Record<EntityTabKind, string> = {
  fields: "Поля",
  records: "Записи",
  files: "Файлы",
  history: "История",
  entity: "Сущность",
};

const TAB_KIND_ORDER: EntityTabKind[] = [
  "fields",
  "records",
  "files",
  "history",
  "entity",
];

function EntityTabForm({
  mode,
  initialName,
  initialKind = "fields",
  entityOptions = [],
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initialName: string;
  initialKind: EntityTabKind;
  entityOptions: EntityTabEntityOption[];
  onCancel: () => void;
  onSubmit: (data: EntityTabFormPayload) => void;
}) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<EntityTabKind>(
    mode === "edit" ? initialKind : "fields",
  );
  const [entitySource, setEntitySource] =
    useState<EntityTabEntitySource>("new");
  const [linkedEntityId, setLinkedEntityId] = useState(
    entityOptions[0]?.id ?? "",
  );
  const [recordsDisplay, setRecordsDisplay] = useState<EntityRecordsDisplay>(
    DEFAULT_RECORDS_DISPLAY,
  );
  const [recordColumns, setRecordColumns] = useState<EntityRecordColumns>(
    DEFAULT_RECORD_COLUMNS,
  );
  const isEdit = mode === "edit";
  const isEntityTab = kind === "entity";
  const isExisting = isEntityTab && entitySource === "existing";

  const selectedEntity = useMemo(
    () => entityOptions.find((item) => item.id === linkedEntityId) ?? null,
    [entityOptions, linkedEntityId],
  );

  const canSubmit = isExisting
    ? linkedEntityId.trim().length > 0
    : name.trim().length > 0;

  function applyDisplayFromOption(option: EntityTabEntityOption | null) {
    if (!option) {
      setRecordsDisplay(DEFAULT_RECORDS_DISPLAY);
      setRecordColumns(DEFAULT_RECORD_COLUMNS);
      return;
    }
    setRecordsDisplay(
      normalizeEntityRecordsDisplay(
        option.recordsDisplay ?? DEFAULT_RECORDS_DISPLAY,
      ),
    );
    setRecordColumns(
      normalizeEntityRecordColumns(
        option.recordColumns ?? DEFAULT_RECORD_COLUMNS,
      ),
    );
  }

  function submit() {
    if (!canSubmit) return;
    if (isEdit) {
      onSubmit({ name: name.trim(), kind: initialKind });
      onCancel();
      return;
    }

    if (kind === "entity" && entitySource === "existing") {
      const entityName = selectedEntity?.name.trim() || "Сущность";
      onSubmit({
        name: name.trim() || entityName,
        kind: "entity",
        entitySource: "existing",
        linkedEntityId,
        recordsDisplay,
        recordColumns,
      });
      onCancel();
      return;
    }

    onSubmit({
      name: name.trim(),
      kind,
      entitySource: kind === "entity" ? "new" : undefined,
      ...(kind === "entity" ? { recordsDisplay, recordColumns } : {}),
    });
    onCancel();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Редактировать вкладку" : "Новая вкладка"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Измените название вкладки."
            : "Поля, записи, файлы или связанная сущность."}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {!isEdit ? (
            <div className="flex flex-col gap-2">
              <Label>Тип вкладки</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  if (value === normalizeEntityTabKind(value)) {
                    setKind(value);
                    if (value === "entity" && entitySource === "existing") {
                      applyDisplayFromOption(
                        entityOptions.find(
                          (item) => item.id === linkedEntityId,
                        ) ??
                          entityOptions[0] ??
                          null,
                      );
                    } else if (value === "entity") {
                      setRecordsDisplay(DEFAULT_RECORDS_DISPLAY);
                      setRecordColumns(DEFAULT_RECORD_COLUMNS);
                    }
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{TAB_KIND_LABELS[kind]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TAB_KIND_ORDER.map((item) => (
                    <SelectItem key={item} value={item}>
                      {TAB_KIND_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {!isEdit && isEntityTab ? (
            <div className="flex flex-col gap-2">
              <Label>Источник</Label>
              <Select
                value={entitySource}
                onValueChange={(value) => {
                  if (value === "new" || value === "existing") {
                    setEntitySource(value);
                    if (value === "existing") {
                      const fallback = entityOptions[0];
                      const nextId = linkedEntityId || fallback?.id || "";
                      if (nextId) setLinkedEntityId(nextId);
                      const option =
                        entityOptions.find((item) => item.id === nextId) ??
                        fallback;
                      applyDisplayFromOption(option ?? null);
                    } else {
                      setRecordsDisplay(DEFAULT_RECORDS_DISPLAY);
                      setRecordColumns(DEFAULT_RECORD_COLUMNS);
                    }
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {entitySource === "existing" ? "Существующая" : "Новая"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Новая</SelectItem>
                  <SelectItem value="existing">Существующая</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {!isEdit && isExisting ? (
            <div className="flex flex-col gap-2">
              <Label>Сущность</Label>
              {entityOptions.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                  Нет доступных сущностей для связи.
                </p>
              ) : (
                <Select
                  value={linkedEntityId}
                  onValueChange={(value) => {
                    if (value == null) return;
                    const nextId = String(value);
                    setLinkedEntityId(nextId);
                    const option = entityOptions.find(
                      (item) => item.id === nextId,
                    );
                    applyDisplayFromOption(option ?? null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {selectedEntity?.name ?? "Выберите сущность"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {entityOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="entity-tab-name">
              {isExisting ? "Название вкладки" : "Название"}
            </Label>
            <Input
              id="entity-tab-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                isExisting
                  ? selectedEntity?.name || "Например, Контакты"
                  : isEntityTab
                    ? "Например, Счета"
                    : kind === "records"
                      ? "Например, Комментарии"
                      : kind === "files"
                        ? "Например, Документы"
                        : kind === "history"
                          ? "Например, История"
                          : "Например, Детали"
              }
              autoFocus={!isExisting}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                submit();
              }}
            />
            {!isEdit && isEntityTab ? (
              <p className="text-xs text-muted-foreground">
                {isExisting
                  ? "Сущность или подсущность останется общей; на этой вкладке — её записи, связанные с текущей. Можно выбрать эту же сущность."
                  : "Будет создана отдельная сущность со своими полями и записями."}
              </p>
            ) : null}
            {!isEdit && kind === "records" ? (
              <p className="text-xs text-muted-foreground">
                На странице записи появится лента текстовых заметок.
              </p>
            ) : null}
            {!isEdit && kind === "files" ? (
              <p className="text-xs text-muted-foreground">
                Файловая система записи. Папки по умолчанию настроите на вкладке
                после создания.
              </p>
            ) : null}
            {!isEdit && kind === "history" ? (
              <p className="text-xs text-muted-foreground">
                На странице записи появится лента изменений: кто, когда и что
                поменял.
              </p>
            ) : null}
          </div>
        </div>

        {!isEdit && isEntityTab ? (
          <div className="border-t border-border pt-4">
            <EntityRecordsDisplayFields
              recordsDisplay={recordsDisplay}
              recordColumns={recordColumns}
              onRecordsDisplayChange={setRecordsDisplay}
              onRecordColumnsChange={setRecordColumns}
              columnsSelectId="entity-tab-record-columns"
              hint="Как связанные записи показывать на странице родителя."
            />
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" disabled={!canSubmit} onClick={submit}>
          {isEdit ? "Сохранить" : "Создать"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityTabDialog({
  open,
  onOpenChange,
  initialName = "",
  initialKind = "fields",
  mode = "create",
  entityOptions = [],
  onSubmit,
}: EntityTabDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <EntityTabForm
            key={`${mode}-${initialName}-${initialKind}-${entityOptions.length}`}
            mode={mode}
            initialName={initialName}
            initialKind={initialKind}
            entityOptions={entityOptions}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
