import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/cn";
import { notifyError } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  getEntityRelationTargetId,
  isEntityNameField,
  resolveEntityListFieldOptions,
  useEntityConfig,
  type Entity,
  type EntityField,
  type EntityFieldType,
} from "@/entities/entity";
import {
  findStaleFieldRefs,
  makeTimesheetRef,
  refLeafFieldId,
  type TimesheetColumn,
  type TimesheetColumnRoot,
  type TimesheetOutput,
  type TimesheetRef,
  type TimesheetSettings,
  type TimesheetSourceConfig,
} from "../model/config";
import {
  fetchTimesheetSettings,
  saveTimesheetSettings,
  validateTimesheetSettings,
  type TimesheetSettingsIssue,
} from "../api/timesheet-settings-api";

const NONE = "__none__";

/**
 * Session-entity field slots (one record = one logged time entry). These live
 * directly ON the entry entity — the RPC reads them single-hop, so no chains.
 * `link` is the relation from a session to its source row. Expected type(s) per
 * slot grey out non-matching options but never hard-block them.
 */
const ENTRY_FIELD_ROWS: Array<{
  key: Exclude<keyof TimesheetSourceConfig["fields"], "timerOption">;
  label: string;
  hint?: string;
  types: EntityFieldType[];
}> = [
  {
    key: "link",
    label: "Ссылка на источник",
    hint: "связь записи со строкой табеля",
    types: ["relation", "belonging"],
  },
  { key: "employee", label: "Сотрудник", types: ["relation"] },
  { key: "start", label: "Начало", types: ["datetime"] },
  { key: "end", label: "Окончание", types: ["datetime"] },
  {
    key: "hours",
    label: "Часы",
    hint: "если нет «Начало/Окончание»",
    types: [
      "number",
      "numberSum",
      "formula",
      "rollup",
      "timeHours",
      "relatedTimeHours",
    ],
  },
  { key: "comment", label: "Комментарий", types: ["text", "textarea"] },
];

/**
 * Source-entity field slots (one record = one timesheet row). These resolve
 * from the source entity and MAY traverse relation hops, so each is a path.
 */
const HOST_FIELD_ROWS: Array<{
  key: keyof Omit<TimesheetSourceConfig["host"], "finalStatusOptions" | "name">;
  label: string;
  types: EntityFieldType[];
}> = [
  { key: "project", label: "Проект", types: ["relation"] },
  {
    key: "parentTask",
    label: "Родительская задача",
    types: ["relation", "belonging"],
  },
  { key: "stage", label: "Этап", types: ["relation"] },
  { key: "assignee", label: "Исполнитель", types: ["relation"] },
  {
    key: "planned",
    label: "План (часы)",
    types: [
      "number",
      "numberSum",
      "formula",
      "rollup",
      "timeHours",
      "relatedTimeHours",
    ],
  },
  { key: "startDate", label: "Дата постановки", types: ["datetime"] },
  { key: "due", label: "Срок", types: ["datetime"] },
  { key: "status", label: "Статус", types: ["list"] },
];

/** The entity that owns a field id (ids are unique across the project). */
function ownerEntityOfField(
  entities: readonly Entity[],
  fieldId: string | null,
): Entity | null {
  if (!fieldId) return null;
  return entities.find((e) => e.fields.some((f) => f.id === fieldId)) ?? null;
}

/** Look up a field by id within one entity. */
function fieldOfEntity(
  entity: Entity | null,
  fieldId: string | null,
): EntityField | null {
  if (!entity || !fieldId) return null;
  return entity.fields.find((f) => f.id === fieldId) ?? null;
}

const RELATION_TYPES: EntityFieldType[] = ["relation", "belonging"];

/**
 * Entities along a host field path. `chain[i]` owns `path[i]`; `chain[length]`
 * is the entity reached after the last pick (for optional further drilling) or
 * null when the last field isn't a relation.
 */
function pathEntities(
  entities: readonly Entity[],
  baseEntityId: string | null,
  path: string[],
): (Entity | null)[] {
  const chain: (Entity | null)[] = [];
  let current = baseEntityId
    ? (entities.find((e) => e.id === baseEntityId) ?? null)
    : null;
  chain.push(current);
  for (const fieldId of path) {
    const field = current?.fields.find((f) => f.id === fieldId) ?? null;
    const target = field ? getEntityRelationTargetId(field) : null;
    current = target ? (entities.find((e) => e.id === target) ?? null) : null;
    chain.push(current);
  }
  return chain;
}

/** The leaf field a (possibly multi-hop) host path points at, if resolvable. */
function resolveLeafField(
  entities: readonly Entity[],
  baseEntityId: string | null,
  path: string[],
): EntityField | null {
  if (!baseEntityId || path.length === 0) return null;
  const chain = pathEntities(entities, baseEntityId, path);
  const owner = chain[path.length - 1];
  return owner?.fields.find((f) => f.id === path[path.length - 1]) ?? null;
}

/** The name field id of an entity (what the RPC shows as its title). */
function nameFieldId(
  entities: readonly Entity[],
  id: string | null,
): string | null {
  if (!id) return null;
  const entity = entities.find((e) => e.id === id);
  return entity?.fields.find((f) => isEntityNameField(f))?.id ?? null;
}

/** The entity a single (single-hop) relation field points at. */
function relationTargetOfField(
  entities: readonly Entity[],
  entityId: string | null,
  fieldId: string | null,
): string | null {
  if (!entityId || !fieldId) return null;
  const field = fieldOfEntity(
    entities.find((e) => e.id === entityId) ?? null,
    fieldId,
  );
  return field ? getEntityRelationTargetId(field) : null;
}

/** The entity a (possibly multi-hop) host path's leaf relation points at. */
function relationTargetOfPath(
  entities: readonly Entity[],
  baseEntityId: string | null,
  path: string[] | undefined,
): string | null {
  const leaf = resolveLeafField(entities, baseEntityId, path ?? []);
  return leaf ? getEntityRelationTargetId(leaf) : null;
}

/**
 * Derive the shared name-lookup block from what the admin already mapped: the
 * users/project/task/stage entities are just the relation targets of the
 * employee/project/parentTask/stage slots, and each name field is the target's
 * own name field. This replaces the old hand-filled «Общие справочники».
 * Un-derivable bits (`userDeptField`/`userLegalField` — there's no visible slot
 * for them) are carried over from the stored config. Anything that can't be
 * derived falls back to the previously stored value, so an existing config
 * never breaks on open.
 */
function deriveTimesheetShared(
  settings: TimesheetSettings,
  entities: readonly Entity[],
): TimesheetSettings["shared"] {
  const prev = settings.shared;
  const sources = settings.sources;

  const firstPathTarget = (
    pick: (s: TimesheetSourceConfig) => TimesheetRef | null,
  ): string | null => {
    for (const s of sources) {
      const target = relationTargetOfPath(
        entities,
        s.hostEntityId,
        pick(s)?.path,
      );
      if (target) return target;
    }
    return null;
  };

  // Users entity: the employee relation on the session, else the assignee
  // relation on the source — both point at the people directory.
  let usersEntityId: string | null = null;
  for (const s of sources) {
    const emp = relationTargetOfField(
      entities,
      s.entryEntityId,
      refLeafFieldId(s.fields.employee),
    );
    if (emp) {
      usersEntityId = emp;
      break;
    }
    const asg = relationTargetOfPath(
      entities,
      s.hostEntityId,
      s.host.assignee?.path,
    );
    if (asg) {
      usersEntityId = asg;
      break;
    }
  }
  usersEntityId = usersEntityId ?? prev.usersEntityId ?? "entity-system-users";

  const userDeptField = prev.userDeptField ?? null;
  const userLegalField = prev.userLegalField ?? null;
  const deptEntityId =
    relationTargetOfField(entities, usersEntityId, userDeptField) ??
    prev.deptEntityId ??
    null;
  const projectEntityId =
    firstPathTarget((s) => s.host.project) ?? prev.projectEntityId ?? null;
  const taskEntityId =
    firstPathTarget((s) => s.host.parentTask) ?? prev.taskEntityId ?? null;
  const stageEntityId =
    firstPathTarget((s) => s.host.stage) ?? prev.stageEntityId ?? null;

  return {
    usersEntityId,
    userNameField: nameFieldId(entities, usersEntityId),
    userDeptField,
    userLegalField,
    deptEntityId,
    deptNameField: nameFieldId(entities, deptEntityId),
    projectEntityId,
    projectNameField: nameFieldId(entities, projectEntityId),
    taskEntityId,
    taskNameField: nameFieldId(entities, taskEntityId),
    stageEntityId,
    stageNameField: nameFieldId(entities, stageEntityId),
  };
}

/** Session field slots (all `fields` except the non-ref `timerOption`). */
const SESSION_FIELD_KEYS = [
  "start",
  "end",
  "hours",
  "employee",
  "link",
  "method",
  "comment",
] as const satisfies ReadonlyArray<
  Exclude<keyof TimesheetSourceConfig["fields"], "timerOption">
>;

function blankSettings(): TimesheetSettings {
  return {
    shared: {
      usersEntityId: "entity-system-users",
      userNameField: null,
      userDeptField: null,
      userLegalField: null,
      deptEntityId: null,
      deptNameField: null,
      projectEntityId: null,
      projectNameField: null,
      taskEntityId: null,
      taskNameField: null,
      stageEntityId: null,
      stageNameField: null,
    },
    sources: [],
    columns: [],
  };
}

function blankSource(): TimesheetSourceConfig {
  return {
    // `source` mirrors the host entity id — set when a source entity is picked.
    source: "",
    hostEntityId: "",
    entryEntityId: "",
    fields: {
      start: null,
      end: null,
      hours: null,
      employee: null,
      link: null,
      method: null,
      timerOption: null,
      comment: null,
    },
    host: {
      name: null,
      project: null,
      parentTask: null,
      planned: null,
      startDate: null,
      due: null,
      status: null,
      finalStatusOptions: [],
      stage: null,
      assignee: null,
    },
    outputs: [],
  };
}

function blankFields(): TimesheetSourceConfig["fields"] {
  return blankSource().fields;
}

function blankHost(): TimesheetSourceConfig["host"] {
  return blankSource().host;
}

/** Settings tab: which entities/fields the timesheet is built from. */
export function TimesheetSettings({ leading }: { leading?: ReactNode }) {
  const { entities } = useEntityConfig();
  // The editable copy of what's currently stored in the DB. Null while loading.
  const [draft, setDraft] = useState<TimesheetSettings | null>(null);
  const [issues, setIssues] = useState<TimesheetSettingsIssue[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const entityById = useCallback(
    (id: string | null | undefined): Entity | null =>
      id ? (entities.find((item) => item.id === id) ?? null) : null,
    [entities],
  );

  // Show what's currently in the DB. If it's never been set, start from a blank
  // config — the admin fills it in by hand.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [stored, found] = await Promise.all([
          fetchTimesheetSettings(),
          validateTimesheetSettings().catch(
            () => [] as TimesheetSettingsIssue[],
          ),
        ]);
        if (!active) return;
        // Older stored configs predate `columns` — default it so the editor and
        // the save round-trip always have an array to work with.
        setDraft(
          stored
            ? { ...stored, columns: stored.columns ?? [] }
            : blankSettings(),
        );
        setIssues(found);
      } catch (error) {
        if (active) setLoadError(error);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const isLoading = draft === null && loadError == null;

  // Name lookups are not edited directly — they're derived from the mapped
  // relation slots, so the admin only maps roles and the rest follows.
  const derivedShared = useMemo(
    () => (draft ? deriveTimesheetShared(draft, entities) : null),
    [draft, entities],
  );

  // Output names already defined across sources — offered as `{{…}}` hints in
  // the column editor so templates reference real values.
  const outputNames = useMemo(
    () =>
      Array.from(
        new Set(
          (draft?.sources ?? [])
            .flatMap((s) => (s.outputs ?? []).map((o) => o.name.trim()))
            .filter(Boolean),
        ),
      ),
    [draft],
  );

  // Entity-level breakage comes from the server; dangling FIELD refs we can
  // detect here against the loaded entity config (no round-trip needed). Run it
  // against the derived shared block so auto-detected lookups are validated too.
  const fieldIssues = useMemo(
    () =>
      draft && derivedShared
        ? findStaleFieldRefs({ ...draft, shared: derivedShared }, entities)
        : [],
    [draft, derivedShared, entities],
  );
  const allIssues = useMemo(
    () => [
      ...issues.map((i) => ({ path: i.path, ref: i.ref, kind: i.kind })),
      ...fieldIssues,
    ],
    [issues, fieldIssues],
  );

  const patchShared = (patch: Partial<TimesheetSettings["shared"]>) =>
    setDraft((d) => (d ? { ...d, shared: { ...d.shared, ...patch } } : d));

  const patchSource = (index: number, next: TimesheetSourceConfig) =>
    setDraft((d) =>
      d
        ? { ...d, sources: d.sources.map((s, i) => (i === index ? next : s)) }
        : d,
    );

  const nameField = (entity: Entity | null): string | null =>
    entity?.fields.find((f) => isEntityNameField(f))?.id ?? null;

  const save = async () => {
    if (!draft || !derivedShared) return;
    setSaving(true);
    try {
      // Persist the derived lookups so the RPC reads the same names the editor
      // shows — the admin never hand-maintains them.
      await saveTimesheetSettings({ ...draft, shared: derivedShared });
      const found = await validateTimesheetSettings().catch(
        () => [] as TimesheetSettingsIssue[],
      );
      setIssues(found);
      toast.success("Настройки табеля сохранены");
    } catch (error) {
      notifyError("Не удалось сохранить настройки табеля", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="sticky top-0 z-20 -mx-1 flex min-h-9 min-w-0 items-center bg-background px-1 pb-3">
          <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {leading}
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-2 bg-background pl-2">
            <Button
              type="button"
              onClick={() => void save()}
              disabled={!draft || saving}
            >
              {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Табель</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Укажите, откуда брать строки табеля и учтённое время. Если структура
            данных изменится — просто переназначьте поля.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-8">
        {isLoading && (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Загрузка
            настроек…
          </div>
        )}

        {loadError != null && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Не удалось загрузить настройки</div>
              <div className="mt-0.5 text-destructive/80">
                {loadError instanceof Error
                  ? loadError.message
                  : "Повторите попытку позже."}
              </div>
            </div>
          </div>
        )}

        {draft && derivedShared && (
          <div className="space-y-6">
            {allIssues.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="h-4 w-4" /> Устаревшие ссылки (
                  {allIssues.length})
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {allIssues.map((issue) => (
                    <li key={issue.path}>
                      {issue.path}:{" "}
                      {issue.kind === "field"
                        ? `поле «${issue.ref}» удалено`
                        : `сущность «${issue.ref}» не найдена`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Источники</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft((d) =>
                      d ? { ...d, sources: [blankSource(), ...d.sources] } : d,
                    )
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Добавить источник
                </Button>
              </div>

              {draft.sources.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Источников нет. Нажмите «Добавить источник».
                </p>
              )}

              {draft.sources.map((source, index) => (
                <SourceCard
                  key={index}
                  source={source}
                  entities={entities}
                  entityById={entityById}
                  nameField={nameField}
                  onChange={(next) => patchSource(index, next)}
                  onRemove={() =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            sources: d.sources.filter((_, i) => i !== index),
                          }
                        : d,
                    )
                  }
                />
              ))}
            </div>

            <AutoLookups
              shared={derivedShared}
              entities={entities}
              entityById={entityById}
              patchShared={patchShared}
            />

            <ColumnsSection
              columns={draft.columns}
              availableNames={outputNames}
              onChange={(columns) =>
                setDraft((d) => (d ? { ...d, columns } : d))
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pickers */

function EntitySelect({
  entities,
  value,
  onChange,
  placeholder = "Не выбрано",
}: {
  entities: readonly Entity[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  // base-ui can't map value→label while the popup is closed, and falls back to
  // the raw value (the NONE sentinel) — so always render a label string. Use the
  // relation-target suffix so cloned entities (several «Сессия») are told apart.
  const selectedEntity = value
    ? (entities.find((item) => item.id === value) ?? null)
    : null;
  const selected = selectedEntity
    ? entityPickerLabel(selectedEntity, entities)
    : placeholder;
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={placeholder}>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {entities.map((entity) => (
          <SelectItem key={entity.id} value={entity.id}>
            {entityPickerLabel(entity, entities)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FieldSelect({
  entity,
  value,
  onChange,
  placeholder = "Не выбрано",
}: {
  entity: Entity | null;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const selected =
    (value ? entity?.fields.find((f) => f.id === value)?.name : null) ??
    placeholder;
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={!entity}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={placeholder}>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {(entity?.fields ?? []).map((field) => (
          <SelectItem key={field.id} value={field.id}>
            {field.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Group header: entity name + the entities its relations point to, so clones
 *  with the same name (e.g. several «Сессия») are told apart. */
function entityPickerLabel(
  entity: Entity,
  entities: readonly Entity[],
): string {
  const targets = Array.from(
    new Set(
      entity.fields
        .filter((f) => f.type === "relation" || f.type === "belonging")
        .map((f) => getEntityRelationTargetId(f))
        .map((id) => (id ? entities.find((e) => e.id === id)?.name : null))
        .filter((name): name is string => !!name && name !== entity.name),
    ),
  );
  return targets.length
    ? `${entity.name} · ${targets.join(", ")}`
    : entity.name;
}

/**
 * Picks ONE field by id. Fields are listed across the whole project, grouped by
 * entity; those whose type matches the slot come first, the rest are greyed (but
 * still selectable, for non-standard setups). Pass `restrictEntityId` once the
 * slot's entity is pinned, to show only that entity's fields.
 */
function FieldRefPicker({
  entities,
  value,
  onChange,
  types,
  restrictEntityId,
  disabled,
  placeholder = "Не выбрано",
}: {
  entities: readonly Entity[];
  value: string | null;
  onChange: (fieldId: string | null, entityId: string | null) => void;
  types: EntityFieldType[];
  restrictEntityId?: string | null;
  disabled?: boolean;
  placeholder?: string;
}) {
  const pool = restrictEntityId
    ? entities.filter((e) => e.id === restrictEntityId)
    : entities;
  // Field ids can collide across cloned entities, so the Select value is a
  // unique `entityId::fieldId` pair (base-ui selects by value equality).
  const selectedEntity = restrictEntityId
    ? (entities.find((e) => e.id === restrictEntityId) ?? null)
    : value
      ? ownerEntityOfField(entities, value)
      : null;
  const selected =
    (value ? selectedEntity?.fields.find((f) => f.id === value)?.name : null) ??
    placeholder;
  const selectedValue =
    value && selectedEntity ? `${selectedEntity.id}::${value}` : NONE;
  return (
    <Select
      value={selectedValue}
      onValueChange={(v) => {
        if (v == null || v === NONE) {
          onChange(null, null);
          return;
        }
        const sep = v.indexOf("::");
        onChange(v.slice(sep + 2), v.slice(0, sep));
      }}
      disabled={disabled}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder={placeholder}>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {pool.map((entity) => {
          // An empty `types` means every field fits (used by free columns).
          const matches = (type: EntityFieldType) =>
            types.length === 0 || types.includes(type);
          const sorted = [...entity.fields].sort(
            (a, b) => Number(!matches(a.type)) - Number(!matches(b.type)),
          );
          return (
            <SelectGroup key={entity.id}>
              {!restrictEntityId && (
                <SelectLabel>{entityPickerLabel(entity, entities)}</SelectLabel>
              )}
              {sorted.map((field) => (
                <SelectItem
                  key={field.id}
                  value={`${entity.id}::${field.id}`}
                  className={cn(
                    !matches(field.type) && "text-muted-foreground/50",
                  )}
                >
                  {field.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * Picks a host field PATH, one hop at a time. The first select lists the source
 * entity's fields; choosing a relation reveals a further select scoped to its
 * target entity, so admins can reach a field on a related entity (e.g. «доп
 * инфа → статус»). The leaf select greys by the slot's expected `types`;
 * intermediate hops grey to relations.
 */
function FieldPathPicker({
  entities,
  baseEntityId,
  path,
  onChange,
  types,
  disabled,
}: {
  entities: readonly Entity[];
  baseEntityId: string | null;
  path: string[];
  onChange: (path: string[]) => void;
  types: EntityFieldType[];
  disabled?: boolean;
}) {
  const chain = pathEntities(entities, baseEntityId, path);
  const trailing = chain[path.length]; // drill target, or base when path empty
  return (
    <div className="flex flex-col gap-1">
      {path.map((fieldId, index) => {
        const owner = chain[index];
        if (!owner) return null;
        const isLeaf = index === path.length - 1;
        return (
          <FieldRefPicker
            key={index}
            entities={entities}
            restrictEntityId={owner.id}
            value={fieldId}
            types={isLeaf ? types : RELATION_TYPES}
            disabled={disabled}
            onChange={(id) =>
              onChange(
                id ? [...path.slice(0, index), id] : path.slice(0, index),
              )
            }
          />
        );
      })}
      {!disabled && trailing && (
        <FieldRefPicker
          entities={entities}
          restrictEntityId={trailing.id}
          value={null}
          types={types}
          placeholder={path.length === 0 ? "Не выбрано" : "↳ через связь…"}
          onChange={(id) => id && onChange([...path, id])}
        />
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // A plain <div>, NOT <label>: wrapping a base-ui Select in a <label> makes an
  // item click (bubbling through the portal in the React tree) re-trigger the
  // label's first control (the Select trigger), cancelling the selection.
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-2 text-xs text-muted-foreground">
      <span className="leading-tight">
        {label}
        {hint && (
          <span className="block text-[10px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

/** A labelled group header inside a source card. */
function StepHeader({
  step,
  title,
  hint,
}: {
  step: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
        {step}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{title}</div>
        {hint && (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- lookups */

/**
 * Read-only view of the auto-derived name lookups, plus the two slots that
 * genuinely can't be derived (the user's «отдел»/«юрлицо» fields — there's no
 * visible timesheet role for them).
 */
function AutoLookups({
  shared,
  entities,
  entityById,
  patchShared,
}: {
  shared: TimesheetSettings["shared"];
  entities: readonly Entity[];
  entityById: (id: string | null | undefined) => Entity | null;
  patchShared: (patch: Partial<TimesheetSettings["shared"]>) => void;
}) {
  const usersEntity = entityById(shared.usersEntityId);
  const name = (id: string | null) =>
    (id ? entities.find((e) => e.id === id)?.name : null) ?? "—";
  const detected: Array<{ label: string; value: string }> = [
    { label: "Пользователи", value: name(shared.usersEntityId) },
    { label: "Отделы", value: name(shared.deptEntityId) },
    { label: "Проекты", value: name(shared.projectEntityId) },
    { label: "Задачи", value: name(shared.taskEntityId) },
    { label: "Этапы", value: name(shared.stageEntityId) },
  ];
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Справочники имён</h3>
      <p className="text-xs text-muted-foreground">
        Определяются автоматически по связям, которые вы указали выше. Менять
        вручную не нужно.
      </p>
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {detected.map((item) => (
            <div key={item.label} className="text-xs">
              <span className="text-muted-foreground">{item.label}: </span>
              <span className="font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 space-y-2 border-t border-border/60 pt-2">
          <p className="text-[11px] text-muted-foreground">
            Поля на сущности «{usersEntity?.name ?? "Пользователи"}» — их нельзя
            вывести автоматически:
          </p>
          <Row label="Поле «Отдел»">
            <FieldSelect
              entity={usersEntity}
              value={shared.userDeptField}
              onChange={(id) => patchShared({ userDeptField: id })}
            />
          </Row>
          <Row label="Поле «Юрлицо»">
            <FieldSelect
              entity={usersEntity}
              value={shared.userLegalField}
              onChange={(id) => patchShared({ userLegalField: id })}
            />
          </Row>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ source */

function SourceCard({
  source,
  entities,
  entityById,
  nameField,
  onChange,
  onRemove,
}: {
  source: TimesheetSourceConfig;
  entities: readonly Entity[];
  entityById: (id: string | null | undefined) => Entity | null;
  nameField: (entity: Entity | null) => string | null;
  onChange: (next: TimesheetSourceConfig) => void;
  onRemove: () => void;
}) {
  const sessionEntity = entityById(source.entryEntityId);
  const hostEntity = entityById(source.hostEntityId);
  // Status may sit on the source directly or behind relation hops — resolve the
  // actual leaf field so we can list its options for «завершено».
  const statusField = resolveLeafField(
    entities,
    source.hostEntityId,
    source.host.status?.path ?? [],
  );
  // Method may sit on the session directly or behind relation hops — resolve the
  // actual leaf field so we can list its options for «таймер».
  const methodField = resolveLeafField(
    entities,
    source.entryEntityId || null,
    source.fields.method?.path ?? [],
  );
  const statusOptions = statusField
    ? resolveEntityListFieldOptions(statusField, entities)
    : [];
  const methodOptions = methodField
    ? resolveEntityListFieldOptions(methodField, entities)
    : [];

  // Pick the SOURCE entity directly (one record = one timesheet row). Host
  // field paths build from it, so changing it resets the host slots (their ids
  // are relative to this entity) and seeds the name slot.
  const setHostEntity = (id: string | null) => {
    if ((id ?? "") === source.hostEntityId) return;
    onChange({
      ...source,
      hostEntityId: id ?? "",
      source: id ?? "",
      host: id
        ? { ...blankHost(), name: makeTimesheetRef(nameField(entityById(id))) }
        : blankHost(),
    });
  };

  // Pick the SESSION entity directly (one record = one logged entry). Its field
  // slots are relative to it, so changing it clears them.
  const setEntryEntity = (id: string | null) => {
    if ((id ?? "") === source.entryEntityId) return;
    onChange({ ...source, entryEntityId: id ?? "", fields: blankFields() });
  };

  // Session-field edit: the chosen field also pins the session entity (and,
  // for `link`, auto-fills the source entity from its relation target when it
  // hasn't been chosen yet). Picking a field from a different entity resets the
  // others so the source stays consistent.
  const setSessionField = (
    key: Exclude<keyof TimesheetSourceConfig["fields"], "timerOption">,
    fieldId: string | null,
    entityId: string | null,
  ) => {
    if (!fieldId) {
      const nextFields = { ...source.fields, [key]: null };
      const anyLeft = SESSION_FIELD_KEYS.some((k) =>
        refLeafFieldId(nextFields[k]),
      );
      const cleared: TimesheetSourceConfig = {
        ...source,
        fields: nextFields,
        // Keep the pinned session entity while any session field remains.
        entryEntityId: anyLeft ? source.entryEntityId : "",
      };
      onChange(cleared);
      return;
    }
    // The picker tells us WHICH entity the field came from (ids can collide
    // across cloned entities), so pin it explicitly instead of a first-match.
    const owner = entityId
      ? entityById(entityId)
      : ownerEntityOfField(entities, fieldId);
    const ownerId = owner?.id ?? entityId ?? "";
    const switching =
      !!ownerId && !!source.entryEntityId && ownerId !== source.entryEntityId;
    const nextFields = switching
      ? { ...blankFields(), [key]: makeTimesheetRef(fieldId) }
      : { ...source.fields, [key]: makeTimesheetRef(fieldId) };

    let next: TimesheetSourceConfig = {
      ...source,
      fields: nextFields,
      entryEntityId: ownerId,
    };
    if (key === "link") {
      const linkField = fieldOfEntity(owner, fieldId);
      const hostId = linkField
        ? (getEntityRelationTargetId(linkField) ?? "")
        : "";
      // Convenience: derive the source entity from the link target, but ONLY
      // when it hasn't been chosen yet — a manually picked source wins.
      if (hostId && !next.hostEntityId) {
        next = {
          ...next,
          hostEntityId: hostId,
          // `source` is just a unique tag for row keys — mirror the host id.
          source: hostId,
          host: {
            ...blankHost(),
            name: makeTimesheetRef(nameField(entityById(hostId))),
          },
        };
      }
    }
    onChange(next);
  };

  const setHostField = (
    key: keyof TimesheetSourceConfig["host"],
    path: string[],
  ) =>
    onChange({
      ...source,
      host: { ...source.host, [key]: path.length > 0 ? { path } : null },
    });

  const setTimerOption = (value: string | null) =>
    onChange({ ...source, fields: { ...source.fields, timerOption: value } });

  // «Способ» is a list field reached from the session entity, possibly through
  // relation hops (like host fields). Clearing it drops the timer option too.
  const setMethodPath = (path: string[]) =>
    onChange({
      ...source,
      fields: {
        ...source.fields,
        method: path.length > 0 ? { path } : null,
        timerOption: path.length > 0 ? source.fields.timerOption : null,
      },
    });

  const toggleFinal = (optionId: string) => {
    const current = source.host.finalStatusOptions;
    onChange({
      ...source,
      host: {
        ...source.host,
        finalStatusOptions: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      },
    });
  };

  // Named outputs: values this source exposes to `{{name}}` display columns.
  // Each is a chain from one of the three roots (host/session/employee).
  const outputs = source.outputs ?? [];
  const outputRootEntityId = (
    root: TimesheetColumnRoot | undefined,
  ): string | null => {
    switch (root ?? "host") {
      case "session":
        return source.entryEntityId || null;
      case "employee":
        return (
          relationTargetOfField(
            entities,
            source.entryEntityId,
            refLeafFieldId(source.fields.employee),
          ) ??
          relationTargetOfPath(
            entities,
            source.hostEntityId,
            source.host.assignee?.path,
          ) ??
          "entity-system-users"
        );
      default:
        return source.hostEntityId || null;
    }
  };
  const setOutputs = (next: TimesheetOutput[]) =>
    onChange({ ...source, outputs: next });
  const addOutput = () =>
    setOutputs([
      ...outputs,
      { key: newColumnKey(), name: "", ref: { root: "host", path: [] } },
    ]);
  const patchOutput = (index: number, next: TimesheetOutput) =>
    setOutputs(outputs.map((o, i) => (i === index ? next : o)));
  const removeOutput = (index: number) =>
    setOutputs(outputs.filter((_, i) => i !== index));

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {hostEntity?.name ?? sessionEntity?.name ?? "Новый источник"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 text-muted-foreground"
          onClick={onRemove}
          aria-label="Удалить источник"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* ① Source entity — the backbone of each timesheet row. */}
      <div className="rounded-md bg-muted/40 p-2">
        <StepHeader
          step="1"
          title="Строки табеля"
          hint="каждая строка — одна запись этой сущности"
        />
        <Row label="Сущность-источник">
          <EntitySelect
            entities={entities}
            value={source.hostEntityId || null}
            onChange={setHostEntity}
          />
        </Row>
      </div>

      {/* ② Session entity — the logged-time facts linked to the source. */}
      <div className="rounded-md bg-muted/40 p-2">
        <StepHeader
          step="2"
          title="Учтённое время"
          hint="где лежат записи о затраченном времени"
        />
        <div className="space-y-2">
          <Row label="Сущность записей">
            <EntitySelect
              entities={entities}
              value={source.entryEntityId || null}
              onChange={setEntryEntity}
            />
          </Row>
          {ENTRY_FIELD_ROWS.map((row) => (
            <Row key={row.key} label={row.label} hint={row.hint}>
              <FieldRefPicker
                entities={entities}
                value={refLeafFieldId(source.fields[row.key])}
                onChange={(id, entityId) =>
                  setSessionField(row.key, id, entityId)
                }
                types={row.types}
                restrictEntityId={source.entryEntityId || null}
              />
            </Row>
          ))}
          <Row
            label="Способ (таймер/ручной)"
            hint="список; можно вглубь по связям"
          >
            <FieldPathPicker
              entities={entities}
              baseEntityId={source.entryEntityId || null}
              path={source.fields.method?.path ?? []}
              onChange={setMethodPath}
              types={["list"]}
              disabled={!source.entryEntityId}
            />
          </Row>
          {methodField && (
            <Row label="Опция «таймер»">
              <Select
                value={source.fields.timerOption ?? NONE}
                onValueChange={(v) => setTimerOption(v === NONE ? null : v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Не выбрано">
                    {methodOptions.find(
                      (o) => o.id === source.fields.timerOption,
                    )?.name ?? "Не выбрано"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Не выбрано</SelectItem>
                  {methodOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}
        </div>
      </div>

      {/* ③ Source fields — resolved from the source entity, may drill via hops. */}
      <div className="rounded-md bg-muted/40 p-2">
        <StepHeader
          step="3"
          title="Поля строки"
          hint="от сущности-источника, можно вглубь по связям"
        />
        {!source.hostEntityId && (
          <p className="mb-2 text-[11px] text-muted-foreground">
            Сначала выберите сущность-источник в шаге 1 (или поле «Ссылка на
            источник» — он определится автоматически).
          </p>
        )}
        <div className="space-y-2">
          {HOST_FIELD_ROWS.map((row) => (
            <Row key={row.key} label={row.label}>
              <FieldPathPicker
                entities={entities}
                baseEntityId={source.hostEntityId || null}
                path={source.host[row.key]?.path ?? []}
                onChange={(path) => setHostField(row.key, path)}
                types={row.types}
                disabled={!source.hostEntityId}
              />
            </Row>
          ))}
          {statusField && statusOptions.length > 0 && (
            <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2 text-xs text-muted-foreground">
              <span>Статусы «завершено»</span>
              <div className="flex flex-wrap gap-1.5">
                {statusOptions.map((option) => {
                  const active = source.host.finalStatusOptions.includes(
                    option.id,
                  );
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleFinal(option.id)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ④ Named outputs — values exposed to {{name}} display columns. */}
      <div className="rounded-md bg-muted/40 p-2">
        <StepHeader
          step="4"
          title="Поля для колонок"
          hint="именованные значения; колонки ссылаются на них как {{имя}}"
        />
        <div className="space-y-2">
          {outputs.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Полей нет. Добавьте — напр. «Проект» от «Источник» через связь.
            </p>
          )}
          {outputs.map((out, index) => {
            const root = out.ref.root ?? "host";
            return (
              <div
                key={out.key}
                className="space-y-1 rounded border border-border/60 p-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    className="h-8 flex-1 text-xs"
                    value={out.name}
                    onChange={(e) =>
                      patchOutput(index, { ...out, name: e.target.value })
                    }
                    placeholder="Имя (напр. Проект)"
                  />
                  <Select
                    value={root}
                    onValueChange={(v) =>
                      patchOutput(index, {
                        ...out,
                        ref: { root: v as TimesheetColumnRoot, path: [] },
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-32 shrink-0 text-xs">
                      <SelectValue>{ROOT_LABELS[root]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROOT_ORDER.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROOT_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => removeOutput(index)}
                    aria-label="Удалить поле"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <FieldPathPicker
                  entities={entities}
                  baseEntityId={outputRootEntityId(root)}
                  path={out.ref.path}
                  onChange={(path) =>
                    patchOutput(index, { ...out, ref: { root, path } })
                  }
                  types={[]}
                  disabled={!outputRootEntityId(root)}
                />
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={addOutput}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Добавить поле
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- columns */

function newColumnKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `col-${uuid}`
    : `col-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const ROOT_LABELS: Record<TimesheetColumnRoot, string> = {
  host: "Источник",
  session: "Запись",
  employee: "Сотрудник",
};
const ROOT_ORDER: TimesheetColumnRoot[] = ["host", "session", "employee"];

function ColumnsSection({
  columns,
  availableNames,
  onChange,
}: {
  columns: TimesheetColumn[];
  availableNames: string[];
  onChange: (columns: TimesheetColumn[]) => void;
}) {
  const addColumn = () =>
    onChange([
      ...columns,
      {
        key: newColumnKey(),
        label: "Колонка",
        width: 180,
        sticky: false,
        template: "",
      },
    ]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Колонки таблицы</h3>
          <p className="text-xs text-muted-foreground">
            Столбцы-шаблоны над «полями для колонок» источников. Вставляйте
            имена полей как <span className="font-mono">{"{{имя}}"}</span> — для
            каждой строки подставится значение её источника.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addColumn}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Добавить колонку
        </Button>
      </div>
      {availableNames.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Доступные поля:{" "}
          {availableNames.map((n) => (
            <span
              key={n}
              className="mr-1 inline-block font-mono text-foreground/80"
            >{`{{${n}}}`}</span>
          ))}
        </p>
      )}
      {columns.map((column, index) => (
        <ColumnCard
          key={column.key}
          column={column}
          onChange={(next) =>
            onChange(columns.map((c, i) => (i === index ? next : c)))
          }
          onRemove={() => onChange(columns.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  );
}

function ColumnCard({
  column,
  onChange,
  onRemove,
}: {
  column: TimesheetColumn;
  onChange: (next: TimesheetColumn) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Input
          className="h-8 text-xs"
          value={column.label}
          onChange={(e) => onChange({ ...column, label: e.target.value })}
          placeholder="Заголовок"
        />
        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
          Стики
          <Switch
            checked={column.sticky}
            onCheckedChange={(v) => onChange({ ...column, sticky: v })}
          />
        </label>
        <Input
          type="number"
          className="h-8 w-20 text-xs"
          value={column.width}
          onChange={(e) =>
            onChange({ ...column, width: Number(e.target.value) || 0 })
          }
          placeholder="px"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={onRemove}
          aria-label="Удалить колонку"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        className="min-h-14 text-xs"
        value={column.template}
        onChange={(e) => onChange({ ...column, template: e.target.value })}
        placeholder="Шаблон, напр.: {{Проект}} / {{Задача}}"
      />
    </div>
  );
}
