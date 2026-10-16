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
  isEntityOverviewTab,
  isEntityTabWithLinkedEntity,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  normalizeEntityTabKind,
  type EntityRecordColumns,
  type EntityRecordsDisplay,
  type EntityTab,
  type EntityTabKind,
} from "@/entities/entity";
import { EntityRecordsDisplayFields } from "./EntityRecordsDisplayFields";

export type EntityTabEntitySource = "new" | "existing";

/** Create-only wizard kind — materializes into a real `EntityTabKind` on submit. */
export type EntityTabCreateKind = EntityTabKind | "copy";

export type EntityTabFormPayload = {
  name: string;
  kind: EntityTabKind | "copy";
  entitySource?: EntityTabEntitySource;
  linkedEntityId?: string;
  sourceEntityId?: string;
  sourceTabId?: string;
  recordsDisplay?: EntityRecordsDisplay;
  recordColumns?: EntityRecordColumns;
};

export type EntityTabEntityOption = {
  id: string;
  name: string;
  recordsDisplay?: EntityRecordsDisplay;
  recordColumns?: EntityRecordColumns;
};

export type EntityTabCopySourceOption = {
  id: string;
  name: string;
  tabs: Array<
    Pick<EntityTab, "id" | "name" | "kind" | "locked" | "linkedEntityId">
  >;
};

type EntityTabDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialKind?: EntityTabKind;
  mode?: "create" | "edit";
  entityOptions?: EntityTabEntityOption[];
  /** Entities whose tabs can be used as a copy source. */
  copySourceOptions?: EntityTabCopySourceOption[];
  /** Linked entity ids already used by entity-tabs on the target. */
  usedLinkedEntityIds?: readonly string[];
  onSubmit: (data: EntityTabFormPayload) => void;
};

const DEFAULT_RECORDS_DISPLAY: EntityRecordsDisplay = "cards";
const DEFAULT_RECORD_COLUMNS: EntityRecordColumns = 2;

const TAB_KIND_LABELS: Record<EntityTabCreateKind, string> = {
  fields: "Поля",
  records: "Записи",
  files: "Файлы",
  history: "История",
  entity: "Сущность",
  copy: "Копия",
};

const TAB_KIND_ORDER: EntityTabCreateKind[] = [
  "fields",
  "records",
  "files",
  "history",
  "entity",
  "copy",
];

const SOURCE_TAB_KIND_LABELS: Record<EntityTabKind, string> = {
  fields: "Поля",
  records: "Записи",
  files: "Файлы",
  history: "История",
  entity: "Сущность",
};

function isCopyableSourceTab(
  tab: Pick<EntityTab, "kind" | "locked" | "id" | "linkedEntityId">,
  usedLinkedEntityIds: Set<string>,
) {
  if (isEntityOverviewTab(tab)) return false;
  if (
    isEntityTabWithLinkedEntity(tab) &&
    tab.linkedEntityId &&
    usedLinkedEntityIds.has(tab.linkedEntityId)
  ) {
    return false;
  }
  return true;
}

function EntityTabForm({
  mode,
  initialName,
  initialKind = "fields",
  entityOptions = [],
  copySourceOptions = [],
  usedLinkedEntityIds = [],
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initialName: string;
  initialKind: EntityTabKind;
  entityOptions: EntityTabEntityOption[];
  copySourceOptions: EntityTabCopySourceOption[];
  usedLinkedEntityIds: readonly string[];
  onCancel: () => void;
  onSubmit: (data: EntityTabFormPayload) => void;
}) {
  const usedLinkedSet = useMemo(
    () => new Set(usedLinkedEntityIds),
    [usedLinkedEntityIds],
  );

  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<EntityTabCreateKind>(
    mode === "edit" ? initialKind : "fields",
  );
  const [entitySource, setEntitySource] =
    useState<EntityTabEntitySource>("new");
  const [linkedEntityId, setLinkedEntityId] = useState(
    entityOptions[0]?.id ?? "",
  );
  const [sourceEntityId, setSourceEntityId] = useState("");
  const [sourceTabId, setSourceTabId] = useState("");
  const [recordsDisplay, setRecordsDisplay] = useState<EntityRecordsDisplay>(
    DEFAULT_RECORDS_DISPLAY,
  );
  const [recordColumns, setRecordColumns] = useState<EntityRecordColumns>(
    DEFAULT_RECORD_COLUMNS,
  );
  const isEdit = mode === "edit";
  const isEntityTab = kind === "entity";
  const isCopyTab = kind === "copy";
  const isExisting = isEntityTab && entitySource === "existing";

  const selectedEntity = useMemo(
    () => entityOptions.find((item) => item.id === linkedEntityId) ?? null,
    [entityOptions, linkedEntityId],
  );

  const copyableSources = useMemo(() => {
    return copySourceOptions
      .map((source) => ({
        ...source,
        tabs: source.tabs.filter((tab) =>
          isCopyableSourceTab(tab, usedLinkedSet),
        ),
      }))
      .filter((source) => source.tabs.length > 0);
  }, [copySourceOptions, usedLinkedSet]);

  const selectedSourceEntity = useMemo(
    () => copyableSources.find((item) => item.id === sourceEntityId) ?? null,
    [copyableSources, sourceEntityId],
  );

  const selectedSourceTab = useMemo(
    () =>
      selectedSourceEntity?.tabs.find((tab) => tab.id === sourceTabId) ?? null,
    [selectedSourceEntity, sourceTabId],
  );

  const canSubmit = isCopyTab
    ? Boolean(sourceEntityId && sourceTabId)
    : isExisting
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

  function selectCopySourceEntity(nextId: string) {
    setSourceEntityId(nextId);
    const source = copyableSources.find((item) => item.id === nextId);
    const firstTab = source?.tabs[0];
    setSourceTabId(firstTab?.id ?? "");
    if (!name.trim() && firstTab) {
      setName(firstTab.name);
    }
  }

  function selectCopySourceTab(nextId: string) {
    setSourceTabId(nextId);
    const tab = selectedSourceEntity?.tabs.find((item) => item.id === nextId);
    if (tab && (!name.trim() || name === selectedSourceTab?.name)) {
      setName(tab.name);
    }
  }

  function submit() {
    if (!canSubmit) return;
    if (isEdit) {
      onSubmit({ name: name.trim(), kind: initialKind });
      onCancel();
      return;
    }

    if (kind === "copy") {
      if (!sourceEntityId || !sourceTabId) return;
      onSubmit({
        name: name.trim() || selectedSourceTab?.name || "Новая вкладка",
        kind: "copy",
        sourceEntityId,
        sourceTabId,
      });
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
            : "Поля, записи, файлы, связанная сущность или копия вкладки."}
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
                  if (value === "copy") {
                    setKind("copy");
                    const first = copyableSources[0];
                    if (first) {
                      setSourceEntityId(first.id);
                      const firstTab = first.tabs[0];
                      setSourceTabId(firstTab?.id ?? "");
                      if (!name.trim() && firstTab) setName(firstTab.name);
                    } else {
                      setSourceEntityId("");
                      setSourceTabId("");
                    }
                    return;
                  }
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

          {!isEdit && isCopyTab ? (
            <>
              <div className="flex flex-col gap-2">
                <Label>Сущность</Label>
                {copyableSources.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                    Нет вкладок, которые можно скопировать.
                  </p>
                ) : (
                  <Select
                    value={sourceEntityId || undefined}
                    onValueChange={(value) => {
                      if (value == null) return;
                      selectCopySourceEntity(String(value));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {selectedSourceEntity?.name ?? "Выберите сущность"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {copyableSources.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Вкладка</Label>
                {!selectedSourceEntity ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                    Сначала выберите сущность.
                  </p>
                ) : (
                  <Select
                    value={sourceTabId || undefined}
                    onValueChange={(value) => {
                      if (value == null) return;
                      selectCopySourceTab(String(value));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {selectedSourceTab
                          ? `${selectedSourceTab.name} · ${SOURCE_TAB_KIND_LABELS[selectedSourceTab.kind]}`
                          : "Выберите вкладку"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {selectedSourceEntity.tabs.map((tab) => (
                        <SelectItem key={tab.id} value={tab.id}>
                          {tab.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {SOURCE_TAB_KIND_LABELS[tab.kind]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </>
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
              {isExisting || isCopyTab ? "Название вкладки" : "Название"}
            </Label>
            <Input
              id="entity-tab-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                isCopyTab
                  ? selectedSourceTab?.name || "Как у исходной вкладки"
                  : isExisting
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
              autoFocus={!isExisting && !isCopyTab}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                submit();
              }}
            />
            {!isEdit && isCopyTab ? (
              <p className="text-xs text-muted-foreground">
                Создаётся такая же вкладка: тип и настройки (папки, связь)
                копируются. Содержимое записей не переносится.
              </p>
            ) : null}
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
  copySourceOptions = [],
  usedLinkedEntityIds = [],
  onSubmit,
}: EntityTabDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <EntityTabForm
            key={`${mode}-${initialName}-${initialKind}-${entityOptions.length}-${copySourceOptions.length}`}
            mode={mode}
            initialName={initialName}
            initialKind={initialKind}
            entityOptions={entityOptions}
            copySourceOptions={copySourceOptions}
            usedLinkedEntityIds={usedLinkedEntityIds}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
