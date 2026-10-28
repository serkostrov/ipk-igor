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
  SelectOptionGroups,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  ENTITY_TAB_KIND_GROUPS,
  ENTITY_TAB_KIND_LABELS,
  getEntityFieldDisplayName,
  getEntityRelationTargetId,
  isEntityMirrorTab,
  isEntityOverviewTab,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  normalizeEntityTabKind,
  type Entity,
  type EntityField,
  type EntityRecordColumns,
  type EntityRecordsDisplay,
  type EntityTab,
  type EntityTabKind,
} from "@/entities/entity";
import { EntityRecordsDisplayFields } from "./EntityRecordsDisplayFields";

export type EntityTabEntitySource = "new" | "existing";

export type EntityTabFormPayload = {
  name: string;
  kind: EntityTabKind;
  entitySource?: EntityTabEntitySource;
  linkedEntityId?: string;
  sourceRelationFieldId?: string;
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

type EntityTabDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialKind?: EntityTabKind;
  initialSourceRelationFieldId?: string;
  initialSourceTabId?: string;
  mode?: "create" | "edit";
  /** Host entity — needed for mirror relation fields. */
  hostEntity?: Entity | null;
  entityOptions?: EntityTabEntityOption[];
  /** All entities — to list tabs of the relation target. */
  entities?: Entity[];
  onSubmit: (data: EntityTabFormPayload) => void;
};

const DEFAULT_RECORDS_DISPLAY: EntityRecordsDisplay = "cards";
const DEFAULT_RECORD_COLUMNS: EntityRecordColumns = 2;

function relationFieldsOf(entity: Entity | null | undefined): EntityField[] {
  if (!entity) return [];
  return entity.fields.filter(
    (field) =>
      field.type === "relation" && Boolean(getEntityRelationTargetId(field)),
  );
}

function mirrorableTabsOf(entity: Entity | null | undefined): EntityTab[] {
  if (!entity) return [];
  return entity.tabs.filter(
    (tab) => !isEntityOverviewTab(tab) && !isEntityMirrorTab(tab),
  );
}

function EntityTabForm({
  mode,
  initialName,
  initialKind = "fields",
  initialSourceRelationFieldId = "",
  initialSourceTabId = "",
  hostEntity = null,
  entityOptions = [],
  entities = [],
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initialName: string;
  initialKind: EntityTabKind;
  initialSourceRelationFieldId: string;
  initialSourceTabId: string;
  hostEntity: Entity | null;
  entityOptions: EntityTabEntityOption[];
  entities: Entity[];
  onCancel: () => void;
  onSubmit: (data: EntityTabFormPayload) => void;
}) {
  const relationFields = useMemo(
    () => relationFieldsOf(hostEntity),
    [hostEntity],
  );

  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<EntityTabKind>(
    mode === "edit" ? initialKind : "fields",
  );
  const [entitySource, setEntitySource] =
    useState<EntityTabEntitySource>("new");
  const [linkedEntityId, setLinkedEntityId] = useState(
    entityOptions[0]?.id ?? "",
  );
  const [sourceRelationFieldId, setSourceRelationFieldId] = useState(() => {
    if (
      initialSourceRelationFieldId &&
      relationFields.some((field) => field.id === initialSourceRelationFieldId)
    ) {
      return initialSourceRelationFieldId;
    }
    return relationFields[0]?.id ?? "";
  });
  const [sourceTabId, setSourceTabId] = useState(initialSourceTabId);
  const [recordsDisplay, setRecordsDisplay] = useState<EntityRecordsDisplay>(
    DEFAULT_RECORDS_DISPLAY,
  );
  const [recordColumns, setRecordColumns] = useState<EntityRecordColumns>(
    DEFAULT_RECORD_COLUMNS,
  );
  const isEdit = mode === "edit";
  const isEntityTab = kind === "entity";
  const isMirrorTab = kind === "mirror";
  const isExisting = isEntityTab && entitySource === "existing";
  const canEditMirrorSource =
    isMirrorTab && (!isEdit || initialKind === "mirror");

  const selectedEntity = useMemo(
    () => entityOptions.find((item) => item.id === linkedEntityId) ?? null,
    [entityOptions, linkedEntityId],
  );

  const selectedRelationField = useMemo(
    () =>
      relationFields.find((field) => field.id === sourceRelationFieldId) ??
      null,
    [relationFields, sourceRelationFieldId],
  );

  const mirrorTargetEntity = useMemo(() => {
    const targetId = selectedRelationField
      ? getEntityRelationTargetId(selectedRelationField)
      : null;
    if (!targetId) return null;
    return entities.find((item) => item.id === targetId) ?? null;
  }, [entities, selectedRelationField]);

  const mirrorSourceTabs = useMemo(
    () => mirrorableTabsOf(mirrorTargetEntity),
    [mirrorTargetEntity],
  );

  const selectedSourceTab = useMemo(
    () => mirrorSourceTabs.find((tab) => tab.id === sourceTabId) ?? null,
    [mirrorSourceTabs, sourceTabId],
  );

  const canSubmit = isMirrorTab
    ? Boolean(sourceRelationFieldId && sourceTabId)
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

  function selectMirrorRelation(fieldId: string) {
    setSourceRelationFieldId(fieldId);
    const field = relationFields.find((item) => item.id === fieldId) ?? null;
    const targetId = field ? getEntityRelationTargetId(field) : null;
    const target = targetId
      ? (entities.find((item) => item.id === targetId) ?? null)
      : null;
    const tabs = mirrorableTabsOf(target);
    const firstTab = tabs[0];
    setSourceTabId(firstTab?.id ?? "");
    if (!name.trim() && firstTab) setName(firstTab.name);
  }

  function selectMirrorSourceTab(tabId: string) {
    setSourceTabId(tabId);
    const tab = mirrorSourceTabs.find((item) => item.id === tabId);
    if (tab && (!name.trim() || name === selectedSourceTab?.name)) {
      setName(tab.name);
    }
  }

  function activateMirrorKind() {
    setKind("mirror");
    const field = relationFields[0];
    if (!field) {
      setSourceRelationFieldId("");
      setSourceTabId("");
      return;
    }
    selectMirrorRelation(field.id);
  }

  function submit() {
    if (!canSubmit) return;
    if (isEdit) {
      if (initialKind === "mirror") {
        if (!sourceRelationFieldId || !sourceTabId) return;
        onSubmit({
          name: name.trim() || selectedSourceTab?.name || "Вкладка",
          kind: "mirror",
          sourceRelationFieldId,
          sourceTabId,
        });
        onCancel();
        return;
      }
      onSubmit({
        name: name.trim(),
        kind: initialKind,
      });
      onCancel();
      return;
    }

    if (kind === "mirror") {
      if (!sourceRelationFieldId || !sourceTabId) return;
      onSubmit({
        name: name.trim() || selectedSourceTab?.name || "Новая вкладка",
        kind: "mirror",
        sourceRelationFieldId,
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
            ? initialKind === "mirror"
              ? "Название и источник данных из связанной записи."
              : "Измените название вкладки."
            : "Поля, записи, файлы, связанная сущность или вкладка из связи."}
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
                  if (value === "mirror") {
                    activateMirrorKind();
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
                  <SelectValue>{ENTITY_TAB_KIND_LABELS[kind]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectOptionGroups
                    groups={ENTITY_TAB_KIND_GROUPS}
                    getLabel={(item) => ENTITY_TAB_KIND_LABELS[item]}
                  />
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {canEditMirrorSource ? (
            <>
              <div className="flex flex-col gap-2">
                <Label>Поле связи</Label>
                {relationFields.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                    Добавьте поле типа «Связь», чтобы выбрать запись-источник.
                  </p>
                ) : (
                  <Select
                    value={sourceRelationFieldId || undefined}
                    onValueChange={(value) => {
                      if (value == null) return;
                      selectMirrorRelation(String(value));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {selectedRelationField
                          ? getEntityFieldDisplayName(selectedRelationField)
                          : "Выберите поле"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {relationFields.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {getEntityFieldDisplayName(field)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Вкладка связанной сущности</Label>
                {!mirrorTargetEntity ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                    Сначала выберите поле связи.
                  </p>
                ) : mirrorSourceTabs.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                    У «{mirrorTargetEntity.name}» нет вкладок для отображения.
                  </p>
                ) : (
                  <Select
                    value={sourceTabId || undefined}
                    onValueChange={(value) => {
                      if (value == null) return;
                      selectMirrorSourceTab(String(value));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {selectedSourceTab
                          ? `${selectedSourceTab.name} · ${ENTITY_TAB_KIND_LABELS[selectedSourceTab.kind]}`
                          : "Выберите вкладку"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {mirrorSourceTabs.map((tab) => (
                        <SelectItem key={tab.id} value={tab.id}>
                          {tab.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {ENTITY_TAB_KIND_LABELS[tab.kind]}
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
              {isExisting || isMirrorTab ? "Название вкладки" : "Название"}
            </Label>
            <Input
              id="entity-tab-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                isMirrorTab
                  ? selectedSourceTab?.name || "Как у вкладки источника"
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
              autoFocus={!isExisting && !isMirrorTab}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                submit();
              }}
            />
            {canEditMirrorSource ? (
              <p className="text-xs text-muted-foreground">
                На странице записи здесь покажется выбранная вкладка записи из
                поля связи — с её данными, а не копией схемы. Комментарии и
                файлы общие: правки видны с обеих сущностей.
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
  initialSourceRelationFieldId = "",
  initialSourceTabId = "",
  mode = "create",
  hostEntity = null,
  entityOptions = [],
  entities = [],
  onSubmit,
}: EntityTabDialogProps) {
  const wide =
    mode === "create" || (mode === "edit" && initialKind === "mirror");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          wide ? "max-h-[90vh] overflow-y-auto sm:max-w-lg" : "sm:max-w-md"
        }
      >
        {open ? (
          <EntityTabForm
            key={`${mode}-${initialName}-${initialKind}-${initialSourceRelationFieldId}-${initialSourceTabId}-${hostEntity?.id ?? ""}-${entityOptions.length}`}
            mode={mode}
            initialName={initialName}
            initialKind={initialKind}
            initialSourceRelationFieldId={initialSourceRelationFieldId}
            initialSourceTabId={initialSourceTabId}
            hostEntity={hostEntity}
            entityOptions={entityOptions}
            entities={entities}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
