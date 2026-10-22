import { isSupabaseConfigured } from "@/shared/api/supabase";
import { parseLocalDatetime, toLocalDatetime } from "@/shared/lib/datetime";
import { getErrorMessage } from "@/shared/lib/error-message";
import { formatDateDisplay } from "@/shared/lib/format-date";
import { withTimeout } from "@/shared/lib/with-timeout";
import { syncEntityMenuItems } from "@/entities/menu";
import {
  fetchEntityConfig,
  saveEntityConfig,
  subscribeEntityStructureChanges,
} from "../api/entity-config-api";
import {
  deleteEntityRecord,
  deleteEntityRecordsByEntityId,
  fetchRecordsByEntityId,
  insertEntityRecord,
  subscribeEntityRecordChanges,
  updateEntityRecordValues,
} from "../api/entity-records-api";
import {
  cloneDefaultEntityConfig,
  normalizeEntity,
  normalizeEntityField,
  normalizeEntityListOption,
  normalizeEntityRecord,
  toEntityStructure,
} from "../lib/parse-entity-config";
import {
  parseEntityListValueIds,
  serializeEntityDecimal,
  serializeEntityListValueIds,
} from "../model/field";
import {
  applyEntityFieldDefaults,
  applyEntityFilesTabDefaults,
} from "../model/field-value";
import {
  getEntityTimelineSetup,
  scheduleEntityTimeline,
  withEntityDatePart,
} from "../model/timeline";
import {
  buildTimeEntryValues,
  findRunningTimer,
  getEntityTimeTracking,
  getLoggedHoursByDay,
  getTimeEntryHours,
  planManualTimeEntries,
} from "../model/time-tracking";
import {
  ensureSystemEntities,
  findSystemUserByAuthId,
  syncUsersRoleFieldOptions,
} from "../model/system-entities";
import {
  DEFAULT_ENTITY_FIELD_GROUP,
  ENTITY_FIELD_GROUP_COLUMNS,
  ENTITY_OVERVIEW_TAB_ID,
  PRIMARY_ENTITY_FIELD_GROUP,
  createDefaultEntityListOptions,
  createEntityNameField,
  ensureEntityFieldGroups,
  ensureEntityTabs,
  fitEntityFieldColSpan,
  getEntityFieldGroupName,
  getEntityFieldTabId,
  getEntityFieldsHostTabIds,
  getEntityHomeFieldsTabId,
  getEntityKanbanField,
  getEntityRelationTargetId,
  getEntityTableFields,
  isEntityFieldsHostTab,
  isEntityKanbanGroupField,
  isEntityNameField,
  isEntityOverviewTab,
  isEntitySubEntity,
  isEntityTabWithLinkedEntity,
  isSystemEntity,
  isSystemEntityField,
  getEntityTabLinkFieldIds,
  normalizeEntityDefaultView,
  normalizeEntityFieldGroup,
  normalizeEntityKanbanCardFieldIds,
  normalizeEntityRecordColumns,
  normalizeEntityRecordsDisplay,
  normalizeEntityTab,
  normalizeEntityTabKind,
  packEntityFieldGroupsByArea,
  resolveEntityKanbanFieldId,
  resolveEntityListDependencies,
  resolveEntityListFieldOptions,
} from "../model/types";
import type {
  Entity,
  EntityConfig,
  EntityField,
  EntityFieldGroup,
  EntityFieldGroupArea,
  EntityListOption,
  EntityRecord,
  EntityRecordColumns,
  EntityRecordsDisplay,
  EntityPageLayout,
  EntityTab,
  EntityTimelineConfig,
  EntityTimeTracking,
} from "../model/types";

export type EntityStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

let config: EntityConfig = { entities: [] };
let status: EntityStatus = "loading";
let errorMessage: string | null = null;
let initPromise: Promise<void> | null = null;
let currentAuthUserId: string | null = null;
let stopRecordSync: (() => void) | null = null;
let stopStructureSync: (() => void) | null = null;
let stopVisibilityRefresh: (() => void) | null = null;
/**
 * Schema editor session: mutations update memory immediately, but remote
 * save is deferred until `commitEntitySchemaEdit`.
 */
let schemaEditSession: {
  entityId: string;
  snapshot: EntityConfig;
  dirty: boolean;
} | null = null;

const listeners = new Set<Listener>();

/** Remote echoes of our own writes arrive shortly after; ignore them. */
const LOCAL_WRITE_ECHO_MS = 4000;
const localRecordWrites = new Map<string, number>();
const localStructureWrites = new Map<string, number>();
/** In-flight inserts so updates wait for the row to exist remotely. */
const pendingRecordInserts = new Map<string, Promise<void>>();

function notify() {
  listeners.forEach((listener) => listener());
}

function markLocalRecordWrite(recordId: string) {
  localRecordWrites.set(recordId, Date.now());
}

function isRecentLocalWrite(recordId: string) {
  const at = localRecordWrites.get(recordId);
  if (at == null) return false;
  if (Date.now() - at > LOCAL_WRITE_ECHO_MS) {
    localRecordWrites.delete(recordId);
    return false;
  }
  return true;
}

function markLocalStructureWrite(entityIds: Iterable<string>) {
  const now = Date.now();
  for (const id of entityIds) localStructureWrites.set(id, now);
}

function isRecentLocalStructureWrite(entityId: string) {
  const at = localStructureWrites.get(entityId);
  if (at == null) return false;
  if (Date.now() - at > LOCAL_WRITE_ECHO_MS) {
    localStructureWrites.delete(entityId);
    return false;
  }
  return true;
}

function hasRecentLocalStructureWrites() {
  const now = Date.now();
  for (const [id, at] of localStructureWrites) {
    if (now - at > LOCAL_WRITE_ECHO_MS) {
      localStructureWrites.delete(id);
      continue;
    }
    return true;
  }
  return false;
}

function sameRecordContent(a: EntityRecord, b: EntityRecord) {
  if (a.authUserId !== b.authUserId) return false;
  if (a.createdBy !== b.createdBy) return false;
  const keys = Object.keys(a.values);
  if (keys.length !== Object.keys(b.values).length) return false;
  return keys.every((key) => a.values[key] === b.values[key]);
}

function applyRemoteRecordUpsert(entityId: string, record: EntityRecord) {
  if (isRecentLocalWrite(record.id)) return;
  const entity = config.entities.find((item) => item.id === entityId);
  if (!entity) return;
  const existing = entity.records.find((item) => item.id === record.id);
  if (existing && sameRecordContent(existing, record)) return;
  mapEntityLocal(entityId, (current) => ({
    ...current,
    records: existing
      ? current.records.map((item) => (item.id === record.id ? record : item))
      : [...current.records, record],
  }));
}

function applyRemoteRecordDelete(recordId: string) {
  if (isRecentLocalWrite(recordId)) return;
  const owner = config.entities.find((entity) =>
    entity.records.some((record) => record.id === recordId),
  );
  if (!owner) return;
  mapEntityLocal(owner.id, (current) => ({
    ...current,
    records: current.records.filter((record) => record.id !== recordId),
  }));
}

function applyRemoteStructureUpsert(remote: Entity) {
  if (schemaEditSession) return;
  if (isRecentLocalStructureWrite(remote.id)) return;
  const existing = config.entities.find((item) => item.id === remote.id);
  const merged = normalizeEntity({
    ...remote,
    records: existing?.records ?? [],
  });
  if (existing) {
    const sameStructure =
      JSON.stringify(toEntityStructure(existing)) ===
      JSON.stringify(toEntityStructure(merged));
    if (sameStructure) return;
    setLocalConfig({
      entities: withOptionalTabLinkFields(
        config.entities.map((item) => (item.id === remote.id ? merged : item)),
      ),
    });
    syncEntityMenuItems(menuLabels(config.entities));
    return;
  }
  setLocalConfig({
    entities: withOptionalTabLinkFields([...config.entities, merged]),
  });
  syncEntityMenuItems(menuLabels(config.entities));
}

function applyRemoteStructureDelete(entityId: string) {
  if (schemaEditSession) return;
  if (isRecentLocalStructureWrite(entityId)) return;
  if (!config.entities.some((item) => item.id === entityId)) return;
  setLocalConfig({
    entities: config.entities.filter((item) => item.id !== entityId),
  });
  syncEntityMenuItems(menuLabels(config.entities));
}

function startRecordSync() {
  if (stopRecordSync || !isSupabaseConfigured) return;
  stopRecordSync = subscribeEntityRecordChanges({
    onUpsert: applyRemoteRecordUpsert,
    onDelete: applyRemoteRecordDelete,
  });
}

function startStructureSync() {
  if (stopStructureSync || !isSupabaseConfigured) return;
  stopStructureSync = subscribeEntityStructureChanges({
    onUpsert: applyRemoteStructureUpsert,
    onDelete: applyRemoteStructureDelete,
  });
}

/** Pull structure (+ record values) when the tab becomes visible again. */
async function refreshFromRemote() {
  if (!isSupabaseConfigured || status === "loading") return;
  // Never clobber local schema while an edit/save is in progress or just
  // landed — a stale fetch would revert applied changes ("через время откат").
  if (
    persistStructureTimer ||
    schemaEditSession ||
    structureSaveInFlight ||
    structureSaveQueued ||
    hasRecentLocalStructureWrites()
  ) {
    return;
  }

  try {
    const remote = await withTimeout(
      fetchEntityConfig(),
      12_000,
      "entity structure refresh",
    );
    if (!remote) return;

    // Save may have started while we were fetching — keep local.
    if (
      persistStructureTimer ||
      schemaEditSession ||
      structureSaveInFlight ||
      structureSaveQueued ||
      hasRecentLocalStructureWrites()
    ) {
      return;
    }

    let recordsByEntity: Record<string, EntityRecord[]> = {};
    try {
      recordsByEntity = await withTimeout(
        fetchRecordsByEntityId(),
        30_000,
        "entity records refresh",
      );
    } catch (error: unknown) {
      console.error("[entity] records refresh failed", error);
      for (const entity of config.entities) {
        recordsByEntity[entity.id] = entity.records;
      }
    }

    // Records fetch can take long — a local structure save may have started
    // in the meantime. Never apply a stale structure snapshot over it.
    if (
      persistStructureTimer ||
      schemaEditSession ||
      structureSaveInFlight ||
      structureSaveQueued ||
      hasRecentLocalStructureWrites()
    ) {
      return;
    }

    const localById = new Map(
      config.entities.map((entity) => [entity.id, entity]),
    );
    const entities = withOptionalTabLinkFields(
      remote.entities.map((remoteEntity) => {
        const local = localById.get(remoteEntity.id);
        const records =
          recordsByEntity[remoteEntity.id] ?? local?.records ?? [];
        // Prefer in-memory structure if we recently wrote it (save may still
        // be racing the fetch).
        if (local && isRecentLocalStructureWrite(remoteEntity.id)) {
          return normalizeEntity({ ...local, records });
        }
        return normalizeEntity({ ...remoteEntity, records });
      }),
    );

    setLocalConfig({ entities });
    syncEntityMenuItems(menuLabels(entities));
  } catch (error: unknown) {
    console.error("[entity] structure refresh failed", error);
  }
}

function startVisibilityRefresh() {
  if (stopVisibilityRefresh || !isSupabaseConfigured) return;
  if (typeof document === "undefined") return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void refreshFromRemote();
    }, 400);
  };

  document.addEventListener("visibilitychange", onVisible);
  stopVisibilityRefresh = () => {
    document.removeEventListener("visibilitychange", onVisible);
    if (timer) clearTimeout(timer);
  };
}

function withResolvedListDependencies(entity: Entity): Entity {
  return {
    ...entity,
    fields: resolveEntityListDependencies(entity.fields),
  };
}

function setStatus(next: EntityStatus, message: string | null = null) {
  status = next;
  errorMessage = message;
  notify();
}

function menuLabels(entities: Entity[]) {
  // Include internal entities so they can be placed into menu groups
  // (sidebar hides them; Menu Settings toggles their visibility).
  return entities
    .filter((entity) => !entity.parentEntityId)
    .map((entity) => ({
      id: entity.id,
      label: entity.namePlural || entity.name,
    }));
}

function handlePersistError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);
  console.error("[entity] save failed", error);
  setStatus("error", message);
}

let persistStructureTimer: ReturnType<typeof setTimeout> | null = null;
/** True while `saveEntityConfig` is awaiting the network. */
let structureSaveInFlight = false;
/** Latest snapshot waiting to save after the in-flight request finishes. */
let structureSaveQueued: EntityConfig | null = null;

function cloneEntityConfig(source: EntityConfig): EntityConfig {
  return structuredClone(source);
}

function enqueueStructureSave(snapshot: EntityConfig) {
  if (!isSupabaseConfigured) return;

  if (structureSaveInFlight) {
    structureSaveQueued = snapshot;
    markLocalStructureWrite(snapshot.entities.map((entity) => entity.id));
    return;
  }

  structureSaveInFlight = true;
  markLocalStructureWrite(snapshot.entities.map((entity) => entity.id));

  void saveEntityConfig(snapshot)
    .then(() => {
      // Extend the echo window after a successful write so realtime / refresh
      // cannot briefly flash the pre-save remote shape.
      markLocalStructureWrite(snapshot.entities.map((entity) => entity.id));
    })
    .catch((error: unknown) => {
      handlePersistError(error, "Не удалось сохранить сущности");
    })
    .finally(() => {
      structureSaveInFlight = false;
      const queued = structureSaveQueued;
      structureSaveQueued = null;
      if (queued) enqueueStructureSave(queued);
    });
}

function flushStructureToRemote(immediate = false) {
  if (!isSupabaseConfigured) return;
  markLocalStructureWrite(config.entities.map((entity) => entity.id));
  if (persistStructureTimer) clearTimeout(persistStructureTimer);

  const run = () => {
    persistStructureTimer = null;
    // Snapshot at flush time so a later refresh/setLocal cannot mutate the
    // payload mid-save through a shared object reference.
    enqueueStructureSave(cloneEntityConfig(config));
  };

  if (immediate) {
    run();
    return;
  }

  persistStructureTimer = setTimeout(run, 400);
}

/** Persist entity structure (without records) to the entities table. */
function persistStructure(next: EntityConfig) {
  config = next;
  notify();
  syncEntityMenuItems(menuLabels(next.entities));

  if (schemaEditSession) {
    schemaEditSession = { ...schemaEditSession, dirty: true };
    notify();
    return;
  }

  flushStructureToRemote();
}

/** Start deferred-save editing for an entity schema (settings UI). */
export function beginEntitySchemaEdit(entityId: string) {
  if (schemaEditSession?.entityId === entityId) return;
  if (schemaEditSession) {
    // Drop unsaved work on another entity before starting a new session.
    config = cloneEntityConfig(schemaEditSession.snapshot);
    syncEntityMenuItems(menuLabels(config.entities));
  }
  schemaEditSession = {
    entityId,
    snapshot: cloneEntityConfig(config),
    dirty: false,
  };
  notify();
}

/** Write deferred schema changes to the backend and leave the edit session. */
export function commitEntitySchemaEdit() {
  if (!schemaEditSession) return;
  schemaEditSession = null;
  notify();
  // Commit must hit the network immediately — debounce races with tab
  // visibility refresh and would look like a silent revert.
  flushStructureToRemote(true);
}

/** Restore the pre-edit snapshot and leave the edit session. */
export function cancelEntitySchemaEdit() {
  if (!schemaEditSession) return;
  config = cloneEntityConfig(schemaEditSession.snapshot);
  schemaEditSession = null;
  syncEntityMenuItems(menuLabels(config.entities));
  notify();
}

export function getEntitySchemaEditSession() {
  return schemaEditSession
    ? {
        entityId: schemaEditSession.entityId,
        dirty: schemaEditSession.dirty,
      }
    : null;
}

export function isEntitySchemaEditDirty() {
  return Boolean(schemaEditSession?.dirty);
}

/** Update in-memory state only (records are persisted separately). */
function setLocalConfig(next: EntityConfig) {
  config = next;
  notify();
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** Tab link fields: empty name → parent entity label (required stays as set). */
function withOptionalTabLinkFields(entities: Entity[]): Entity[] {
  return entities.map((entity) => {
    const linkIds = getEntityTabLinkFieldIds(entity.id, entities);
    if (linkIds.size === 0) return entity;

    let changed = false;
    const fields = entity.fields.map((field) => {
      if (!linkIds.has(field.id)) return field;
      if (field.name.trim()) return field;
      const targetId = getEntityRelationTargetId(field);
      const parent = targetId
        ? entities.find((item) => item.id === targetId)
        : null;
      const fallbackName =
        parent?.name.trim() || parent?.namePlural.trim() || "Связь";
      changed = true;
      return normalizeEntityField({
        ...field,
        name: fallbackName,
      });
    });
    return changed ? normalizeEntity({ ...entity, fields }) : entity;
  });
}

function mapEntity(entityId: string, mapper: (entity: Entity) => Entity): void {
  let changed = false;
  const entities = config.entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    changed = true;
    return normalizeEntity(mapper(entity));
  });
  if (!changed) return;
  persistStructure({ entities });
}

function mapEntityLocal(
  entityId: string,
  mapper: (entity: Entity) => Entity,
): void {
  let changed = false;
  const entities = config.entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    changed = true;
    return normalizeEntity(mapper(entity));
  });
  if (!changed) return;
  setLocalConfig({ entities });
}

export function getEntityConfig() {
  return config;
}

/** Signed-in Supabase Auth user (set by the app shell). */
export function setCurrentAuthUserId(authUserId: string | null) {
  if (currentAuthUserId === authUserId) return;
  currentAuthUserId = authUserId;
  notify();
}

/** Users entity record of the signed-in account (`null` when unknown). */
export function getCurrentUserRecordId(): string | null {
  return findSystemUserByAuthId(config.entities, currentAuthUserId)?.id ?? null;
}

export function getEntityStatus() {
  return status;
}

export function getEntityError() {
  return errorMessage;
}

export function subscribeEntityConfig(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function initEntityConfig() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    setStatus("loading");

    try {
      const remote = await withTimeout(
        fetchEntityConfig(),
        12_000,
        "entity config",
      );
      const structure = remote ?? cloneDefaultEntityConfig();
      const remoteEmpty =
        remote != null && remote.entities.length === 0 && isSupabaseConfigured;
      let recordsByEntity: Record<string, EntityRecord[]> = {};
      try {
        recordsByEntity = await withTimeout(
          fetchRecordsByEntityId(),
          60_000,
          "entity records",
        );
      } catch (recordsError: unknown) {
        // Structure must still load if records schema lags (e.g. no created_by).
        console.error("[entity] records load failed", recordsError);
      }
      const ensured = ensureSystemEntities(structure.entities);

      // Drop orphaned records for entities removed by ensure (e.g. abandoned packs).
      if (isSupabaseConfigured && ensured.changed) {
        const keptIds = new Set(ensured.entities.map((entity) => entity.id));
        for (const entity of structure.entities) {
          if (keptIds.has(entity.id)) continue;
          void deleteEntityRecordsByEntityId(entity.id).catch(
            (error: unknown) => {
              console.error(
                "[entity] failed to delete records for removed entity",
                entity.id,
                error,
              );
            },
          );
        }
      }

      const entities = withOptionalTabLinkFields(
        ensured.entities.map((entity) =>
          normalizeEntity({
            ...entity,
            records: recordsByEntity[entity.id] ?? [],
          }),
        ),
      );

      const needsNameFieldPersist = structure.entities.some((entity) => {
        const before = entity.fields ?? [];
        return !before.some((field) => Boolean(field.locked));
      });
      const needsTabLinkPersist = structure.entities.some((before) => {
        const after = entities.find((item) => item.id === before.id);
        if (!after) return false;
        const linkIds = getEntityTabLinkFieldIds(before.id, entities);
        return before.fields.some((field) => {
          if (!linkIds.has(field.id)) return false;
          const next = after.fields.find((item) => item.id === field.id);
          if (!next) return false;
          return field.name.trim() !== next.name.trim();
        });
      });

      // Empty remote + system seed must not persist: upsert+delete would wipe
      // real entities if the fetch ran without a session / under RLS deny.
      const shouldPersist =
        !remoteEmpty &&
        (ensured.changed || needsNameFieldPersist || needsTabLinkPersist);

      if (shouldPersist) {
        persistStructure({ entities });
        setStatus("ready");
      } else {
        config = { entities };
        setStatus("ready");
        // Incomplete/empty remote must not sync the menu — that would strip
        // entity items out of groups and later re-add them at the root.
        if (!remoteEmpty) {
          syncEntityMenuItems(menuLabels(config.entities));
        }
      }
      startRecordSync();
      startStructureSync();
      startVisibilityRefresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" &&
              error != null &&
              "message" in error &&
              typeof (error as { message: unknown }).message === "string"
            ? (error as { message: string }).message
            : "Не удалось загрузить сущности";
      console.error("[entity] load failed", error);
      // Keep system defaults so the shell can open offline / on CORS failure.
      config = cloneDefaultEntityConfig();
      setStatus("error", message);
      // Do not sync menu against an empty fallback — preserves group layout.
    }
  })();

  return initPromise;
}

export function setEntityConfig(next: EntityConfig) {
  persistStructure({
    entities: next.entities.map((entity) => normalizeEntity(entity)),
  });
}

/** Keep Users «Роль» list options in sync with the roles catalog. */
export function syncUsersRoleOptions(
  roles: readonly { id: string; name: string }[],
) {
  const synced = syncUsersRoleFieldOptions(config.entities, roles);
  if (!synced.changed) return;
  persistStructure({
    entities: synced.entities.map((entity) => normalizeEntity(entity)),
  });
}

export function addEntity(data: {
  name: string;
  namePlural: string;
  description: string;
  views?: Entity["views"];
  defaultView?: Entity["defaultView"];
}) {
  const views = data.views ?? ["table"];
  const entity = normalizeEntity({
    id: createId("entity"),
    name: data.name,
    namePlural: data.namePlural,
    description: data.description,
    views,
    defaultView: normalizeEntityDefaultView(views, data.defaultView),
    fields: [createEntityNameField(createId("field"))],
    headerFieldId: null,
    kanbanFieldId: null,
    kanbanCardFieldIds: null,
    tableMassSelection: false,
    tableParentFieldId: null,
    tabs: [],
    fieldGroups: [],
    systemKey: null,
    locked: false,
    parentEntityId: null,
    recordColumns: 2,
    recordsDisplay: "cards",
    timeTracking: null,
    timeline: null,
    pageLayout: null,
    records: [],
  });

  persistStructure({
    entities: [...config.entities, entity],
  });

  return entity;
}

export function updateEntity(
  id: string,
  patch: Partial<
    Pick<
      Entity,
      | "name"
      | "namePlural"
      | "description"
      | "nameTemplate"
      | "views"
      | "defaultView"
      | "recordColumns"
      | "recordsDisplay"
    >
  >,
) {
  mapEntity(id, (entity) => ({
    ...entity,
    ...patch,
  }));
}

export function removeEntity(id: string) {
  const target = config.entities.find((entity) => entity.id === id);
  if (target && isSystemEntity(target)) return;

  const childIds = config.entities
    .filter((entity) => entity.parentEntityId === id)
    .map((entity) => entity.id);
  const removeIds = new Set([id, ...childIds]);

  persistStructure({
    entities: config.entities.filter((entity) => !removeIds.has(entity.id)),
  });

  if (!isSupabaseConfigured) return;

  for (const entityId of removeIds) {
    void deleteEntityRecordsByEntityId(entityId).catch((error: unknown) => {
      handlePersistError(error, "Не удалось удалить записи сущности");
    });
  }
}

export function addEntityField(
  entityId: string,
  data?: Partial<Omit<EntityField, "id">>,
) {
  const entity = config.entities.find((item) => item.id === entityId);
  const type = data?.type ?? "text";
  const field = normalizeEntityField({
    id: createId("field"),
    name: data?.name ?? "Новое поле",
    type,
    hint: data?.hint ?? "",
    group: data?.group ?? "",
    tabId:
      data?.tabId ??
      (entity ? getEntityHomeFieldsTabId(entity.tabs) : ENTITY_OVERVIEW_TAB_ID),
    required: data?.required ?? false,
    locked: false,
    systemKey: null,
    showInTable: data?.showInTable ?? false,
    showInFilters: data?.showInFilters ?? false,
    showOnRecord: data?.showOnRecord ?? true,
    showOnCreate: data?.showOnCreate ?? true,
    includeInTotal: Boolean(data?.includeInTotal),
    tableOrder: data?.tableOrder ?? 0,
    relationEntityId:
      type === "belonging"
        ? entityId
        : type === "relation"
          ? data?.relationEntityId?.trim() || null
          : null,
    relationMultiple:
      type === "relation" ? Boolean(data?.relationMultiple) : false,
    unitSuffix: data?.unitSuffix?.trim() || null,
    formula: data?.formula,
    rollup: data?.rollup,
    lookup: data?.lookup,
    dependencies: data?.dependencies,
    relationGroups: data?.relationGroups,
    defaultValue: data?.defaultValue,
    relationFilter: data?.relationFilter,
    deadline: data?.deadline,
    numberDisplay: data?.numberDisplay,
    numberSignColor: data?.numberSignColor,
    sumFieldIds: type === "numberSum" ? (data?.sumFieldIds ?? []) : [],
    listSourceFieldId:
      type === "list" ? data?.listSourceFieldId?.trim() || null : null,
    listOptions:
      type === "list"
        ? data?.listSourceFieldId?.trim()
          ? []
          : data?.listOptions?.length
            ? data.listOptions
            : createDefaultEntityListOptions(() => createId("list"))
        : [],
    listFixed: type === "list" ? Boolean(data?.listFixed) : false,
    listMultiple:
      type === "list" && Boolean(data?.listFixed)
        ? Boolean(data?.listMultiple)
        : false,
    listAllowOther:
      type === "list" &&
      !(Boolean(data?.listFixed) && Boolean(data?.listMultiple))
        ? Boolean(data?.listAllowOther)
        : false,
    listDependsOnFieldId:
      type === "list" && !data?.listSourceFieldId?.trim()
        ? data?.listDependsOnFieldId?.trim() || null
        : null,
    listUseColors: type === "list" ? data?.listUseColors !== false : true,
    listShowEmptyValue:
      type === "list" ? data?.listShowEmptyValue !== false : true,
    datetimeWithTime:
      type === "datetime" ? Boolean(data?.datetimeWithTime) : false,
    booleanInline: type === "boolean" ? Boolean(data?.booleanInline) : false,
    colSpan:
      data?.colSpan ??
      (type === "relationGroups" ? 4 : type === "period" ? 2 : 1),
    rowSpan: data?.rowSpan ?? 1,
  });

  mapEntity(entityId, (current) => {
    const nextFields = [...current.fields, field];
    const next = withResolvedListDependencies({
      ...current,
      fields: nextFields,
      fieldGroups: ensureEntityFieldGroups(
        upsertFieldGroup(
          current.fieldGroups,
          getEntityFieldGroupName(field.group),
        ),
        nextFields,
      ),
    });
    // Belonging = category-style table tree (parent record → children).
    if (type === "belonging" && !current.tableParentFieldId?.trim()) {
      return { ...next, tableParentFieldId: field.id };
    }
    return next;
  });

  return field;
}

export function updateEntityField(
  entityId: string,
  fieldId: string,
  patch: Partial<Omit<EntityField, "id">>,
) {
  mapEntity(entityId, (entity) => {
    const previous = entity.fields.find((field) => field.id === fieldId);
    const isTabLinkField = getEntityTabLinkFieldIds(
      entityId,
      config.entities,
    ).has(fieldId);
    const nextFields = entity.fields.map((field) => {
      if (field.id !== fieldId) return field;

      if (
        isEntityNameField(field) ||
        isTabLinkField ||
        isSystemEntityField(field)
      ) {
        const layoutOnly: Partial<Omit<EntityField, "id">> = {};
        if (patch.name !== undefined) layoutOnly.name = patch.name;
        if (patch.hint !== undefined) layoutOnly.hint = patch.hint;
        if (patch.showInFilters !== undefined) {
          layoutOnly.showInFilters = patch.showInFilters;
        }
        if (
          isTabLinkField ||
          (isSystemEntityField(field) && !isEntityNameField(field))
        ) {
          if (patch.required !== undefined)
            layoutOnly.required = patch.required;
          if (patch.showInTable !== undefined) {
            layoutOnly.showInTable = patch.showInTable;
          }
          if (patch.tableOrder !== undefined) {
            layoutOnly.tableOrder = patch.tableOrder;
          }
        }
        if (patch.showOnRecord !== undefined && !isEntityNameField(field)) {
          layoutOnly.showOnRecord = patch.showOnRecord;
        }
        if (patch.showOnCreate !== undefined && !isEntityNameField(field)) {
          layoutOnly.showOnCreate = patch.showOnCreate;
        }
        if (patch.group !== undefined) layoutOnly.group = patch.group;
        if (patch.colSpan !== undefined) layoutOnly.colSpan = patch.colSpan;
        if (patch.rowSpan !== undefined) layoutOnly.rowSpan = patch.rowSpan;
        if (patch.tabId !== undefined) layoutOnly.tabId = patch.tabId;
        // System «Роль» (list): allow presentation toggles — otherwise switches
        // in list settings appear stuck (patch was silently dropped).
        if (field.type === "list" && isSystemEntityField(field)) {
          if (patch.listUseColors !== undefined) {
            layoutOnly.listUseColors = patch.listUseColors;
          }
          if (patch.listShowEmptyValue !== undefined) {
            layoutOnly.listShowEmptyValue = patch.listShowEmptyValue;
          }
          if (patch.listFixed !== undefined) {
            layoutOnly.listFixed = patch.listFixed;
            layoutOnly.listMultiple = patch.listFixed
              ? (patch.listMultiple ?? field.listMultiple)
              : false;
          } else if (patch.listMultiple !== undefined && field.listFixed) {
            layoutOnly.listMultiple = patch.listMultiple;
          }
        }
        return normalizeEntityField({ ...field, ...layoutOnly });
      }

      const nextPatch = { ...patch };
      delete nextPatch.systemKey;
      const merged = normalizeEntityField({
        ...field,
        ...nextPatch,
        locked: false,
        systemKey: null,
        ...(nextPatch.type === "belonging" ||
        (nextPatch.type == null && field.type === "belonging")
          ? {
              type: "belonging" as const,
              relationEntityId: entityId,
              relationMultiple: false,
            }
          : null),
      });
      if (merged.type === "list" && merged.listSourceFieldId) {
        return normalizeEntityField({
          ...merged,
          listOptions: [],
          listDependsOnFieldId: null,
        });
      }
      if (
        merged.type === "list" &&
        !merged.listSourceFieldId &&
        (previous?.type !== "list" ||
          Boolean(previous.listSourceFieldId) ||
          merged.listOptions.length === 0) &&
        merged.listOptions.length === 0
      ) {
        return normalizeEntityField({
          ...merged,
          listOptions: createDefaultEntityListOptions(() => createId("list")),
          listSourceFieldId: null,
          listFixed: false,
          listMultiple: false,
          listAllowOther: false,
          listDependsOnFieldId: null,
          listUseColors: true,
          listShowEmptyValue: true,
        });
      }
      if (merged.type === "list" && !merged.listFixed && merged.listMultiple) {
        return { ...merged, listMultiple: false, listAllowOther: false };
      }
      if (
        merged.type === "list" &&
        merged.listMultiple &&
        merged.listAllowOther
      ) {
        return { ...merged, listAllowOther: false };
      }
      if (
        merged.type === "list" &&
        patch.listDependsOnFieldId !== undefined &&
        (previous?.listDependsOnFieldId ?? null) !==
          (merged.listDependsOnFieldId ?? null)
      ) {
        return {
          ...merged,
          listOptions: merged.listOptions.map((option) =>
            option.parentOptionId == null
              ? option
              : { ...option, parentOptionId: null },
          ),
        };
      }
      return merged;
    });

    const nextEntity = withResolvedListDependencies({
      ...entity,
      fields: nextFields,
      fieldGroups: ensureEntityFieldGroups(
        patch.group !== undefined
          ? upsertFieldGroup(
              entity.fieldGroups,
              getEntityFieldGroupName(patch.group),
            )
          : entity.fieldGroups,
        nextFields,
      ),
    });
    const kanbanField = nextEntity.kanbanFieldId
      ? nextEntity.fields.find((item) => item.id === nextEntity.kanbanFieldId)
      : null;
    const kanbanFieldId =
      nextEntity.kanbanFieldId &&
      (!kanbanField || !isEntityKanbanGroupField(kanbanField))
        ? null
        : nextEntity.kanbanFieldId;
    const groupFieldId = resolveEntityKanbanFieldId(
      nextEntity.fields,
      kanbanFieldId,
    );
    return {
      ...nextEntity,
      tableParentFieldId: resolveTableParentFieldIdForStore(
        nextEntity,
        nextEntity.tableParentFieldId,
      ),
      kanbanFieldId,
      kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
        nextEntity.fields,
        groupFieldId,
        nextEntity.kanbanCardFieldIds,
      ),
    };
  });
}

export function removeEntityField(entityId: string, fieldId: string) {
  mapEntity(entityId, (entity) => {
    const target = entity.fields.find((field) => field.id === fieldId);
    if (target && isSystemEntityField(target)) return entity;
    if (getEntityTabLinkFieldIds(entityId, config.entities).has(fieldId)) {
      return entity;
    }

    const nextFields = entity.fields.filter((field) => field.id !== fieldId);
    const kanbanFieldId =
      entity.kanbanFieldId === fieldId ? null : entity.kanbanFieldId;
    const groupFieldId = resolveEntityKanbanFieldId(nextFields, kanbanFieldId);
    return withResolvedListDependencies({
      ...entity,
      fields: nextFields,
      fieldGroups: ensureEntityFieldGroups(entity.fieldGroups, nextFields),
      headerFieldId:
        entity.headerFieldId === fieldId ? null : entity.headerFieldId,
      kanbanFieldId,
      kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
        nextFields,
        groupFieldId,
        entity.kanbanCardFieldIds,
      ),
    });
  });
}

export function setEntityHeaderField(entityId: string, fieldId: string | null) {
  mapEntity(entityId, (entity) => {
    if (fieldId == null) {
      return { ...entity, headerFieldId: null };
    }

    const field = entity.fields.find((item) => item.id === fieldId);
    if (!field || isEntityNameField(field)) return entity;

    return {
      ...entity,
      headerFieldId: fieldId,
    };
  });
}

export function setEntityKanbanField(entityId: string, fieldId: string | null) {
  mapEntity(entityId, (entity) => {
    if (fieldId == null) {
      const groupFieldId = resolveEntityKanbanFieldId(entity.fields, null);
      return {
        ...entity,
        kanbanFieldId: null,
        kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
          entity.fields,
          groupFieldId,
          entity.kanbanCardFieldIds,
        ),
      };
    }

    const field = entity.fields.find((item) => item.id === fieldId);
    if (!field || !isEntityKanbanGroupField(field)) return entity;

    return {
      ...entity,
      kanbanFieldId: fieldId,
      kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
        entity.fields,
        fieldId,
        entity.kanbanCardFieldIds,
      ),
    };
  });
}

export function setEntityKanbanCardFields(
  entityId: string,
  fieldIds: string[] | null,
) {
  mapEntity(entityId, (entity) => {
    const groupFieldId = resolveEntityKanbanFieldId(
      entity.fields,
      entity.kanbanFieldId,
    );
    return {
      ...entity,
      kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
        entity.fields,
        groupFieldId,
        fieldIds,
      ),
    };
  });
}

export function setEntityTableMassSelection(
  entityId: string,
  enabled: boolean,
) {
  mapEntity(entityId, (entity) => ({
    ...entity,
    tableMassSelection: enabled,
  }));
}

function resolveTableParentFieldIdForStore(
  entity: Entity,
  fieldId: string | null,
): string | null {
  const requested = fieldId?.trim() || null;
  if (!requested) return null;
  const field = entity.fields.find((item) => item.id === requested);
  if (!field) return null;
  if (field.type === "list" && !field.listMultiple) return requested;
  if (field.type === "relation" && !field.relationMultiple) return requested;
  if (field.type === "belonging") return requested;
  return null;
}

export function setEntityTableParentField(
  entityId: string,
  fieldId: string | null,
) {
  mapEntity(entityId, (entity) => ({
    ...entity,
    tableParentFieldId: resolveTableParentFieldIdForStore(entity, fieldId),
  }));
}

/** Save both table settings in one write and flush to remote immediately. */
export function setEntityTableSettings(
  entityId: string,
  settings: {
    massSelection: boolean;
    parentFieldId: string | null;
  },
) {
  mapEntity(entityId, (entity) => ({
    ...entity,
    tableMassSelection: settings.massSelection,
    tableParentFieldId: resolveTableParentFieldIdForStore(
      entity,
      settings.parentFieldId,
    ),
  }));
  if (!schemaEditSession) {
    flushStructureToRemote(true);
  }
}

export function addEntityTab(
  entityId: string,
  data?: Partial<Pick<EntityTab, "name" | "kind" | "defaultFolders">>,
) {
  const tab = normalizeEntityTab({
    id: createId("tab"),
    name: data?.name?.trim() || "Новая вкладка",
    locked: false,
    kind: normalizeEntityTabKind(data?.kind),
    linkedEntityId: null,
    parentLinkFieldId: null,
    sourceRelationFieldId: null,
    sourceTabId: null,
    defaultFolders: data?.defaultFolders ?? [],
  });

  mapEntity(entityId, (entity) => ({
    ...entity,
    tabs: [...entity.tabs, tab],
  }));

  // Attach orphan fields (wrong/missing tab) to the home fields tab — groups stay.
  if (isEntityFieldsHostTab(tab)) {
    rescueOrphanEntityFields(entityId);
  }

  return tab;
}

/**
 * Tab that renders another entity’s tab for the record selected in a relation
 * field on the host entity.
 */
export function addEntityMirrorTab(
  entityId: string,
  data: {
    name?: string;
    sourceRelationFieldId: string;
    sourceTabId: string;
  },
) {
  const host = config.entities.find((item) => item.id === entityId);
  if (!host) return null;

  const relationField = host.fields.find(
    (field) =>
      field.id === data.sourceRelationFieldId && field.type === "relation",
  );
  if (!relationField) return null;

  const targetId = getEntityRelationTargetId(relationField);
  const sourceEntity = targetId
    ? config.entities.find((item) => item.id === targetId)
    : null;
  const sourceTab = sourceEntity?.tabs.find(
    (tab) => tab.id === data.sourceTabId,
  );
  if (!sourceEntity || !sourceTab || sourceTab.kind === "mirror") return null;

  const tab = normalizeEntityTab({
    id: createId("tab"),
    name: data.name?.trim() || sourceTab.name,
    locked: false,
    kind: "mirror",
    linkedEntityId: null,
    parentLinkFieldId: null,
    sourceRelationFieldId: relationField.id,
    sourceTabId: sourceTab.id,
    defaultFolders: [],
  });

  mapEntity(entityId, (entity) => ({
    ...entity,
    tabs: [...entity.tabs, tab],
  }));

  return tab;
}

/** Tab with its own entity schema and records linked to the parent record. */
export function addEntityTabWithLinkedEntity(
  parentEntityId: string,
  data: {
    name: string;
    namePlural?: string;
    recordsDisplay?: EntityRecordsDisplay;
    recordColumns?: EntityRecordColumns;
  },
) {
  const parent = config.entities.find((item) => item.id === parentEntityId);
  if (!parent) return null;

  const tabId = createId("tab");
  const childId = createId("entity");
  const linkFieldId = createId("field");
  const nameFieldId = createId("field");
  const label = data.name.trim() || "Новая вкладка";
  const namePlural = data.namePlural?.trim() || label;
  const recordsDisplay = normalizeEntityRecordsDisplay(
    data.recordsDisplay ?? "cards",
  );
  const recordColumns = normalizeEntityRecordColumns(data.recordColumns ?? 2);

  const parentLabel = parent.name.trim() || parent.namePlural.trim() || "Связь";
  const linkField = normalizeEntityField({
    id: linkFieldId,
    name: parentLabel,
    type: "relation",
    hint: "",
    group: "",
    tabId: ENTITY_OVERVIEW_TAB_ID,
    required: false,
    locked: false,
    systemKey: null,
    showInTable: false,
    showInFilters: false,
    showOnRecord: true,
    showOnCreate: true,
    includeInTotal: false,
    tableOrder: 0,
    relationEntityId: parentEntityId,
    relationMultiple: false,
    unitSuffix: null,
    sumFieldIds: [],
    listOptions: [],
    listSourceFieldId: null,
    listFixed: false,
    listMultiple: false,
    listAllowOther: false,
    listDependsOnFieldId: null,
    listUseColors: true,
    listShowEmptyValue: true,
    datetimeWithTime: false,
    booleanInline: false,
    colSpan: 1,
    rowSpan: 1,
  });

  const childEntity = normalizeEntity({
    id: childId,
    name: label,
    namePlural,
    description: "",
    views: ["table"],
    defaultView: null,
    fields: [createEntityNameField(nameFieldId), linkField],
    headerFieldId: null,
    kanbanFieldId: null,
    kanbanCardFieldIds: null,
    tableMassSelection: false,
    tableParentFieldId: null,
    tabs: [],
    fieldGroups: [],
    systemKey: null,
    locked: false,
    parentEntityId,
    recordColumns,
    recordsDisplay,
    timeTracking: null,
    timeline: null,
    pageLayout: null,
    records: [],
  });

  const tab = normalizeEntityTab({
    id: tabId,
    name: label,
    locked: false,
    kind: "entity",
    linkedEntityId: childId,
    parentLinkFieldId: linkFieldId,
  });

  persistStructure({
    entities: [
      ...config.entities.map((entity) =>
        entity.id === parentEntityId
          ? { ...entity, tabs: [...entity.tabs, tab] }
          : entity,
      ),
      childEntity,
    ],
  });

  return tab;
}

/**
 * Tab that shows records of an existing entity, filtered by a relation to the parent record.
 * Does not take ownership of the linked entity (it stays in the global list).
 */
export function addEntityTabWithExistingEntity(
  parentEntityId: string,
  data: {
    linkedEntityId: string;
    name?: string;
    recordsDisplay?: EntityRecordsDisplay;
    recordColumns?: EntityRecordColumns;
  },
) {
  const parent = config.entities.find((item) => item.id === parentEntityId);
  const linked = config.entities.find(
    (item) => item.id === data.linkedEntityId,
  );
  if (!parent || !linked) return null;

  const alreadyLinked = parent.tabs.some(
    (tab) =>
      isEntityTabWithLinkedEntity(tab) && tab.linkedEntityId === linked.id,
  );
  if (alreadyLinked) return null;

  const existingLink = linked.fields.find(
    (field) =>
      field.type === "relation" &&
      getEntityRelationTargetId(field) === parentEntityId,
  );

  let linkFieldId = existingLink?.id ?? "";
  let nextLinked = linked;

  const parentLabel = parent.name.trim() || parent.namePlural.trim() || "Связь";
  const recordsDisplay = normalizeEntityRecordsDisplay(
    data.recordsDisplay ?? linked.recordsDisplay,
  );
  const recordColumns = normalizeEntityRecordColumns(
    data.recordColumns ?? linked.recordColumns,
  );

  if (!existingLink) {
    linkFieldId = createId("field");
    const linkField = normalizeEntityField({
      id: linkFieldId,
      name: parentLabel,
      type: "relation",
      hint: "",
      group: "",
      tabId: ENTITY_OVERVIEW_TAB_ID,
      required: false,
      locked: false,
      systemKey: null,
      showInTable: false,
      showInFilters: false,
      showOnRecord: true,
      showOnCreate: true,
      includeInTotal: false,
      tableOrder: 0,
      relationEntityId: parentEntityId,
      relationMultiple: false,
      unitSuffix: null,
      sumFieldIds: [],
      listOptions: [],
      listSourceFieldId: null,
      listFixed: false,
      listMultiple: false,
      listAllowOther: false,
      listDependsOnFieldId: null,
      listUseColors: true,
      listShowEmptyValue: true,
      datetimeWithTime: false,
      booleanInline: false,
      colSpan: 1,
      rowSpan: 1,
    });
    nextLinked = normalizeEntity({
      ...linked,
      fields: [...linked.fields, linkField],
      recordsDisplay,
      recordColumns,
    });
  } else if (!existingLink.name.trim()) {
    nextLinked = normalizeEntity({
      ...linked,
      fields: linked.fields.map((field) =>
        field.id === existingLink.id
          ? normalizeEntityField({
              ...field,
              name: parentLabel,
            })
          : field,
      ),
      recordsDisplay,
      recordColumns,
    });
  } else {
    nextLinked = normalizeEntity({
      ...linked,
      recordsDisplay,
      recordColumns,
    });
  }

  const tabName =
    data.name?.trim() ||
    linked.namePlural.trim() ||
    linked.name.trim() ||
    "Сущность";

  const tab = normalizeEntityTab({
    id: createId("tab"),
    name: tabName,
    locked: false,
    kind: "entity",
    linkedEntityId: linked.id,
    parentLinkFieldId: linkFieldId,
  });

  persistStructure({
    entities: config.entities.map((entity) => {
      let next = entity;
      if (entity.id === linked.id) next = nextLinked;
      if (entity.id === parentEntityId) {
        next = { ...next, tabs: [...next.tabs, tab] };
      }
      return next;
    }),
  });

  return tab;
}

export function updateEntityTab(
  entityId: string,
  tabId: string,
  patch: Partial<Pick<EntityTab, "name" | "defaultFolders">>,
) {
  const parent = config.entities.find((item) => item.id === entityId);
  if (!parent) return;
  const target = parent.tabs.find((tab) => tab.id === tabId);
  const nextName = patch.name?.trim();

  if (
    target &&
    isEntityTabWithLinkedEntity(target) &&
    target.linkedEntityId &&
    nextName
  ) {
    const linked = config.entities.find(
      (item) => item.id === target.linkedEntityId,
    );
    const ownsLinked = linked?.parentEntityId === entityId;

    persistStructure({
      entities: config.entities.map((entity) => {
        if (entity.id === entityId) {
          return {
            ...entity,
            tabs: entity.tabs.map((tab) =>
              tab.id === tabId
                ? normalizeEntityTab({ ...tab, name: nextName })
                : tab,
            ),
          };
        }
        if (ownsLinked && entity.id === target.linkedEntityId) {
          return {
            ...entity,
            name: nextName,
            namePlural: nextName,
          };
        }
        return entity;
      }),
    });
    return;
  }

  mapEntity(entityId, (entity) => {
    const tabTarget = entity.tabs.find((tab) => tab.id === tabId);
    if (!tabTarget) return entity;

    const isOverview = isEntityOverviewTab(tabTarget);
    return {
      ...entity,
      tabs: entity.tabs.map((tab) =>
        tab.id === tabId
          ? normalizeEntityTab({
              ...tab,
              name: patch.name ?? tab.name,
              defaultFolders:
                patch.defaultFolders !== undefined
                  ? patch.defaultFolders
                  : tab.defaultFolders,
              locked: isOverview,
            })
          : tab,
      ),
    };
  });
}

export function removeEntityTab(entityId: string, tabId: string) {
  const parent = config.entities.find((item) => item.id === entityId);
  const target = parent?.tabs.find((tab) => tab.id === tabId);
  if (!parent || !target || parent.tabs.length <= 1) return;

  const linkedEntityId =
    isEntityTabWithLinkedEntity(target) && target.linkedEntityId
      ? target.linkedEntityId
      : null;
  const linked = linkedEntityId
    ? config.entities.find((item) => item.id === linkedEntityId)
    : null;
  const ownedLinkedId =
    linked && linked.parentEntityId === entityId ? linked.id : null;
  const linkFieldId = target.parentLinkFieldId?.trim() || null;
  const linkFieldStillUsed =
    Boolean(linkFieldId) &&
    config.entities.some((entity) =>
      entity.tabs.some(
        (tab) =>
          tab.id !== tabId &&
          isEntityTabWithLinkedEntity(tab) &&
          tab.parentLinkFieldId === linkFieldId,
      ),
    );
  const remainingTabs = parent.tabs.filter((tab) => tab.id !== tabId);
  const fallbackTabId =
    remainingTabs.find((tab) => isEntityFieldsHostTab(tab))?.id ??
    remainingTabs[0]?.id ??
    ENTITY_OVERVIEW_TAB_ID;

  persistStructure({
    entities: config.entities
      .filter((entity) => entity.id !== ownedLinkedId)
      .map((entity) => {
        let next = entity;

        if (entity.id === entityId) {
          const tabs = ensureEntityTabs(
            next.tabs.filter((tab) => tab.id !== tabId),
          );
          const resolvedFallback =
            tabs.find((tab) => tab.id === fallbackTabId)?.id ??
            tabs[0]?.id ??
            ENTITY_OVERVIEW_TAB_ID;
          next = {
            ...next,
            tabs,
            fields: next.fields.map((field) =>
              getEntityFieldTabId(field) === tabId
                ? normalizeEntityField({
                    ...field,
                    tabId: resolvedFallback,
                  })
                : field,
            ),
          };
        }

        if (
          linkFieldId &&
          !linkFieldStillUsed &&
          !ownedLinkedId &&
          entity.id === linkedEntityId
        ) {
          const fields = next.fields.filter(
            (field) => field.id !== linkFieldId,
          );
          const kanbanFieldId =
            next.kanbanFieldId === linkFieldId ? null : next.kanbanFieldId;
          const groupFieldId = resolveEntityKanbanFieldId(
            fields,
            kanbanFieldId,
          );
          next = {
            ...next,
            fields,
            fieldGroups: ensureEntityFieldGroups(next.fieldGroups, fields),
            headerFieldId:
              next.headerFieldId === linkFieldId ? null : next.headerFieldId,
            kanbanFieldId,
            kanbanCardFieldIds: normalizeEntityKanbanCardFieldIds(
              fields,
              groupFieldId,
              next.kanbanCardFieldIds,
            ),
            records: next.records.map((record) => {
              if (!(linkFieldId in record.values)) return record;
              const values = { ...record.values };
              delete values[linkFieldId];
              return { ...record, values };
            }),
          };
        }

        return next;
      }),
  });

  if (ownedLinkedId && isSupabaseConfigured) {
    void deleteEntityRecordsByEntityId(ownedLinkedId).catch(
      (error: unknown) => {
        handlePersistError(
          error,
          "Не удалось удалить записи связанной сущности",
        );
      },
    );
  }
}

/** Reorder tabs. Overview stays first and cannot be moved. */
export function reorderEntityTabs(
  entityId: string,
  fromIndex: number,
  toIndex: number,
) {
  mapEntity(entityId, (entity) => {
    if (fromIndex === toIndex) return entity;
    if (fromIndex < 0 || fromIndex >= entity.tabs.length) return entity;

    const fromTab = entity.tabs[fromIndex];
    if (!fromTab || isEntityOverviewTab(fromTab)) return entity;

    const overviewIndex = entity.tabs.findIndex((tab) =>
      isEntityOverviewTab(tab),
    );
    const minIndex = overviewIndex >= 0 ? overviewIndex + 1 : 0;
    let insertAt = Math.max(minIndex, Math.min(toIndex, entity.tabs.length));
    if (fromIndex < insertAt) insertAt -= 1;
    if (insertAt === fromIndex || insertAt < minIndex) return entity;

    const next = [...entity.tabs];
    const [removed] = next.splice(fromIndex, 1);
    if (!removed) return entity;
    next.splice(insertAt, 0, removed);

    return {
      ...entity,
      tabs: ensureEntityTabs(next),
    };
  });
}

export function moveEntityFieldToTab(
  entityId: string,
  fieldId: string,
  tabId: string,
) {
  mapEntity(entityId, (entity) => {
    const field = entity.fields.find((item) => item.id === fieldId);
    if (!field || isEntityNameField(field)) return entity;

    const resolvedTabId = entity.tabs.some((tab) => tab.id === tabId)
      ? tabId
      : (entity.tabs[0]?.id ?? ENTITY_OVERVIEW_TAB_ID);
    if (getEntityFieldTabId(field) === resolvedTabId) return entity;

    return {
      ...entity,
      fields: entity.fields.map((item) =>
        item.id === fieldId
          ? normalizeEntityField({ ...item, tabId: resolvedTabId })
          : item,
      ),
    };
  });
}

function upsertFieldGroup(
  fieldGroups: EntityFieldGroup[],
  groupName: string,
  colSpan = ENTITY_FIELD_GROUP_COLUMNS,
  area?: EntityFieldGroupArea,
  tabId?: string,
): EntityFieldGroup[] {
  const normalized = normalizeEntityFieldGroup({
    name: groupName,
    colSpan,
    area,
    tabId,
  });
  if (!normalized) return fieldGroups;
  if (fieldGroups.some((group) => group.name === normalized.name)) {
    return fieldGroups;
  }
  return [...fieldGroups, normalized];
}

function removeFieldGroup(
  fieldGroups: EntityFieldGroup[],
  groupName: string,
): EntityFieldGroup[] {
  const label = groupName.trim();
  if (!label || label === DEFAULT_ENTITY_FIELD_GROUP) return fieldGroups;
  return fieldGroups.filter((group) => group.name !== label);
}

export function dissolveEntityFieldGroup(entityId: string, groupName: string) {
  const label = groupName.trim();
  if (
    !label ||
    label === DEFAULT_ENTITY_FIELD_GROUP ||
    label === PRIMARY_ENTITY_FIELD_GROUP
  ) {
    return;
  }

  mapEntity(entityId, (entity) => ({
    ...entity,
    fieldGroups: removeFieldGroup(entity.fieldGroups, label),
    fields: entity.fields.map((field) => {
      if (isEntityNameField(field)) return field;
      if (getEntityFieldGroupName(field.group) !== label) return field;
      return normalizeEntityField({ ...field, group: "" });
    }),
  }));
}

/**
 * Re-attaches fields whose tab is missing / not a fields host onto the home
 * fields tab. Preserves group layout — never dumps custom groups into «Общее».
 * Fields already on a valid fields tab are left alone (including «Общее» on a
 * non-home tab). Sub-entities also drop leftover «Основное» into «Общее».
 */
export function rescueOrphanEntityFields(entityId: string) {
  const current = config.entities.find((item) => item.id === entityId);
  if (!current) return;

  const hostTabIds = getEntityFieldsHostTabIds(current.tabs);
  // Nowhere to attach until a fields tab exists.
  if (hostTabIds.size === 0) return;

  const needsRescue = current.fields.some((field) => {
    if (isEntityNameField(field)) return false;
    if (!hostTabIds.has(getEntityFieldTabId(field))) return true;
    return (
      isEntitySubEntity(current) &&
      getEntityFieldGroupName(field.group) === PRIMARY_ENTITY_FIELD_GROUP
    );
  });
  if (!needsRescue) return;

  mapEntity(entityId, (entity) => {
    const hosts = getEntityFieldsHostTabIds(entity.tabs);
    if (hosts.size === 0) return entity;
    const home = getEntityHomeFieldsTabId(entity.tabs);
    const fields = entity.fields.map((field) => {
      if (isEntityNameField(field)) return field;
      let next = field;
      // Keep group/colSpan — only fix the tab so layout survives re-attach.
      if (!hosts.has(getEntityFieldTabId(next))) {
        next = normalizeEntityField({
          ...next,
          tabId: home,
        });
      }
      if (
        isEntitySubEntity(entity) &&
        getEntityFieldGroupName(next.group) === PRIMARY_ENTITY_FIELD_GROUP
      ) {
        next = normalizeEntityField({
          ...next,
          group: "",
          tabId: home,
        });
      }
      return next;
    });
    return {
      ...entity,
      fields,
      fieldGroups: ensureEntityFieldGroups(entity.fieldGroups, fields),
    };
  });
}

export function renameEntityFieldGroup(
  entityId: string,
  fromName: string,
  toName: string,
) {
  const from = fromName.trim();
  const to = toName.trim();
  if (
    !from ||
    !to ||
    from === to ||
    from === DEFAULT_ENTITY_FIELD_GROUP ||
    from === PRIMARY_ENTITY_FIELD_GROUP ||
    to === PRIMARY_ENTITY_FIELD_GROUP
  ) {
    return;
  }

  mapEntity(entityId, (entity) => {
    if (
      entity.fieldGroups.some((group) => group.name === to) ||
      entity.fields.some(
        (field) =>
          !isEntityNameField(field) &&
          getEntityFieldGroupName(field.group) === to,
      )
    ) {
      return entity;
    }

    const fields = entity.fields.map((field) => {
      if (isEntityNameField(field)) return field;
      if (getEntityFieldGroupName(field.group) !== from) return field;
      return normalizeEntityField({ ...field, group: to });
    });

    const existing = entity.fieldGroups.find((group) => group.name === from);
    const fieldGroups = existing
      ? entity.fieldGroups.map((group) =>
          group.name === from ? { ...group, name: to } : group,
        )
      : upsertFieldGroup(entity.fieldGroups, to);

    return {
      ...entity,
      fields,
      fieldGroups: ensureEntityFieldGroups(fieldGroups, fields),
    };
  });
}

export function reorderEntityFieldGroups(
  entityId: string,
  orderedNames: string[],
  colSpans?: Record<string, number>,
) {
  mapEntity(entityId, (entity) => {
    const byName = new Map(
      entity.fieldGroups.map((group) => [group.name, group] as const),
    );
    const next: EntityFieldGroup[] = [];
    const seen = new Set<string>();

    for (const raw of orderedNames) {
      const name = raw.trim();
      if (!name || name === PRIMARY_ENTITY_FIELD_GROUP || seen.has(name)) {
        continue;
      }
      seen.add(name);
      const prev = byName.get(name);
      const span =
        colSpans?.[name] ?? prev?.colSpan ?? ENTITY_FIELD_GROUP_COLUMNS;
      const normalized = normalizeEntityFieldGroup({
        name,
        colSpan: span,
        area: prev?.area,
        tabId: prev?.tabId,
        display: prev?.display,
        hideTitle: prev?.hideTitle,
      });
      if (normalized) next.push(normalized);
    }

    for (const group of entity.fieldGroups) {
      if (seen.has(group.name)) continue;
      next.push(group);
    }

    return {
      ...entity,
      fieldGroups: ensureEntityFieldGroups(
        packEntityFieldGroupsByArea(next),
        entity.fields,
      ),
    };
  });
}

export function placeEntityFieldGroup(
  entityId: string,
  groupName: string,
  target: {
    area: EntityFieldGroupArea;
    orderedNames: string[];
    colSpans?: Record<string, number>;
    tabId?: string;
  },
) {
  const label = groupName.trim();
  if (!label || label === PRIMARY_ENTITY_FIELD_GROUP) return;

  mapEntity(entityId, (entity) => {
    const existing = entity.fieldGroups.find((group) => group.name === label);
    const resolvedTabId =
      target.area === "primary"
        ? undefined
        : target.tabId?.trim() || existing?.tabId || undefined;
    const moved = normalizeEntityFieldGroup({
      name: label,
      colSpan:
        target.colSpans?.[label] ??
        existing?.colSpan ??
        ENTITY_FIELD_GROUP_COLUMNS,
      area: target.area,
      tabId: resolvedTabId,
      display: existing?.display,
      hideTitle: existing?.hideTitle,
    });
    if (!moved) return entity;

    const others = entity.fieldGroups.filter((group) => group.name !== label);
    const destOthers = others.filter((group) => group.area === target.area);
    const rest = others.filter((group) => group.area !== target.area);
    const destByName = new Map(
      destOthers.map((group) => [group.name, group] as const),
    );

    const dest: EntityFieldGroup[] = [];
    const seen = new Set<string>();
    for (const raw of target.orderedNames) {
      const name = raw.trim();
      if (!name || name === PRIMARY_ENTITY_FIELD_GROUP || seen.has(name)) {
        continue;
      }
      seen.add(name);
      if (name === label) {
        dest.push(moved);
        continue;
      }
      const prev = destByName.get(name);
      if (!prev) continue;
      const normalized = normalizeEntityFieldGroup({
        ...prev,
        colSpan: target.colSpans?.[name] ?? prev.colSpan,
        area: target.area,
      });
      if (normalized) dest.push(normalized);
    }
    for (const group of destOthers) {
      if (seen.has(group.name)) continue;
      dest.push({ ...group, area: target.area });
    }

    const fieldTabId =
      target.area === "primary"
        ? ENTITY_OVERVIEW_TAB_ID
        : (target.tabId?.trim() ?? "");
    const fields =
      fieldTabId.length > 0
        ? entity.fields.map((field) => {
            if (isEntityNameField(field)) return field;
            if (getEntityFieldGroupName(field.group) !== label) return field;
            if (getEntityFieldTabId(field) === fieldTabId) return field;
            return normalizeEntityField({ ...field, tabId: fieldTabId });
          })
        : entity.fields;

    return {
      ...entity,
      fields,
      fieldGroups: ensureEntityFieldGroups(
        packEntityFieldGroupsByArea([...dest, ...rest]),
        fields,
      ),
    };
  });
}

export function updateEntityFieldGroup(
  entityId: string,
  groupName: string,
  patch: Partial<Pick<EntityFieldGroup, "colSpan" | "display" | "hideTitle">>,
) {
  mapEntity(entityId, (entity) => {
    const label = groupName.trim();
    if (!label || label === PRIMARY_ENTITY_FIELD_GROUP) return entity;

    const existing = entity.fieldGroups.find((group) => group.name === label);
    const base = existing ?? {
      name: label,
      colSpan: ENTITY_FIELD_GROUP_COLUMNS,
      area: "tab" as const,
    };
    const normalized = normalizeEntityFieldGroup({
      ...base,
      ...patch,
      name: label,
    });
    if (!normalized) return entity;

    const others = entity.fieldGroups.filter((group) => group.name !== label);
    return {
      ...entity,
      fieldGroups: ensureEntityFieldGroups(
        existing
          ? entity.fieldGroups.map((group) =>
              group.name === label ? normalized : group,
            )
          : [...others, normalized],
        entity.fields,
      ),
    };
  });
}

export function ensureEntityFieldGroupMeta(
  entityId: string,
  groupName: string,
  colSpan = ENTITY_FIELD_GROUP_COLUMNS,
  tabId?: string,
) {
  mapEntity(entityId, (entity) => {
    const next = upsertFieldGroup(
      entity.fieldGroups,
      groupName,
      colSpan,
      "tab",
      tabId,
    );
    if (next === entity.fieldGroups) return entity;
    return {
      ...entity,
      fieldGroups: ensureEntityFieldGroups(next, entity.fields),
    };
  });
}

export function addEntityListOption(
  entityId: string,
  fieldId: string,
  data?: Partial<Omit<EntityListOption, "id">>,
) {
  const option = normalizeEntityListOption({
    ...data,
    id: createId("list"),
    name: data?.name ?? "Новый вариант",
    color: data?.color ?? "#3b82f6",
    parentOptionId: data?.parentOptionId ?? null,
  });

  mapEntity(entityId, (entity) =>
    withResolvedListDependencies({
      ...entity,
      fields: entity.fields.map((field) => {
        if (field.id !== fieldId || field.type !== "list") return field;
        return normalizeEntityField({
          ...field,
          listOptions: [...field.listOptions, option],
        });
      }),
    }),
  );

  return option;
}

export function updateEntityListOption(
  entityId: string,
  fieldId: string,
  optionId: string,
  patch: Partial<Omit<EntityListOption, "id">>,
) {
  mapEntity(entityId, (entity) =>
    withResolvedListDependencies({
      ...entity,
      fields: entity.fields.map((field) => {
        if (field.id !== fieldId || field.type !== "list") return field;
        return normalizeEntityField({
          ...field,
          listOptions: field.listOptions.map((option) =>
            option.id === optionId
              ? normalizeEntityListOption({ ...option, ...patch })
              : option,
          ),
        });
      }),
    }),
  );
}

export function removeEntityListOption(
  entityId: string,
  fieldId: string,
  optionId: string,
) {
  mapEntity(entityId, (entity) =>
    withResolvedListDependencies({
      ...entity,
      fields: entity.fields.map((field) => {
        if (field.type !== "list") return field;
        if (field.id === fieldId) {
          return normalizeEntityField({
            ...field,
            listOptions: field.listOptions.filter(
              (option) => option.id !== optionId,
            ),
          });
        }
        if (field.listDependsOnFieldId !== fieldId) return field;
        return normalizeEntityField({
          ...field,
          listOptions: field.listOptions.filter(
            (option) => option.parentOptionId !== optionId,
          ),
        });
      }),
    }),
  );
}

/**
 * Moves a list option into a parent group (or unassigned) and/or reorders it.
 * `beforeOptionId: null` appends after the last sibling in the target group.
 */
export function moveEntityListOption(
  entityId: string,
  fieldId: string,
  optionId: string,
  toParentOptionId: string | null,
  beforeOptionId: string | null,
) {
  if (beforeOptionId === optionId) return;

  mapEntity(entityId, (entity) =>
    withResolvedListDependencies({
      ...entity,
      fields: entity.fields.map((field) => {
        if (field.id !== fieldId || field.type !== "list") return field;

        const fromIndex = field.listOptions.findIndex(
          (option) => option.id === optionId,
        );
        if (fromIndex < 0) return field;

        const options = field.listOptions.slice();
        const [removed] = options.splice(fromIndex, 1);
        if (!removed) return field;

        const moved = normalizeEntityListOption({
          ...removed,
          parentOptionId: toParentOptionId,
        });

        let insertAt = options.length;
        if (beforeOptionId) {
          const beforeIndex = options.findIndex(
            (option) => option.id === beforeOptionId,
          );
          if (beforeIndex >= 0) insertAt = beforeIndex;
        } else {
          let lastSibling = -1;
          options.forEach((option, index) => {
            if (option.parentOptionId === toParentOptionId) {
              lastSibling = index;
            }
          });
          if (lastSibling >= 0) insertAt = lastSibling + 1;
        }

        options.splice(insertAt, 0, moved);

        const unchanged = options.every((option, index) => {
          const prev = field.listOptions[index];
          return (
            prev != null &&
            prev.id === option.id &&
            prev.parentOptionId === option.parentOptionId
          );
        });
        if (unchanged) return field;

        return normalizeEntityField({ ...field, listOptions: options });
      }),
    }),
  );
}

/**
 * Places a non-title field at a 1-based column index among table columns.
 * Title field always stays first when present.
 */
export function placeEntityFieldInTable(
  entityId: string,
  fieldId: string,
  position: number,
) {
  mapEntity(entityId, (entity) => {
    const target = entity.fields.find((field) => field.id === fieldId);
    if (!target || isEntityNameField(target)) return entity;

    const hasTitle = entity.fields.some(
      (field) => isEntityNameField(field) && field.showInTable !== false,
    );
    const withoutTarget = getEntityTableFields(entity.fields).filter(
      (field) => field.id !== fieldId,
    );
    const minPosition = hasTitle ? 2 : 1;
    const maxPosition = withoutTarget.length + 1;
    const nextPosition = Math.min(
      maxPosition,
      Math.max(minPosition, Math.round(position)),
    );

    const placed = normalizeEntityField({ ...target, showInTable: true });
    const columns = [
      ...withoutTarget.slice(0, nextPosition - 1),
      placed,
      ...withoutTarget.slice(nextPosition - 1),
    ];

    let order = 1;
    const orderById = new Map<string, number>();
    for (const column of columns) {
      if (isEntityNameField(column)) continue;
      orderById.set(column.id, order);
      order += 1;
    }

    return {
      ...entity,
      fields: entity.fields.map((field) => {
        if (field.id === fieldId) {
          return normalizeEntityField({
            ...field,
            showInTable: true,
            tableOrder: orderById.get(field.id) ?? order,
          });
        }
        const nextOrder = orderById.get(field.id);
        if (nextOrder === undefined) return field;
        if (field.tableOrder === nextOrder) return field;
        return normalizeEntityField({ ...field, tableOrder: nextOrder });
      }),
    };
  });
}

export function reorderEntityFields(entityId: string, fieldIds: string[]) {
  mapEntity(entityId, (entity) => {
    const byId = new Map(entity.fields.map((field) => [field.id, field]));
    const next: EntityField[] = [];

    for (const id of fieldIds) {
      const field = byId.get(id);
      if (!field || isEntityNameField(field)) continue;
      next.push(field);
      byId.delete(id);
    }

    for (const field of byId.values()) {
      if (isEntityNameField(field)) continue;
      next.push(field);
    }

    const nameFields = entity.fields.filter((field) =>
      isEntityNameField(field),
    );
    // Keep table / create / settings order in sync (settings list is source).
    let tableOrder = 1;
    const ordered = next.map((field) => {
      const nextOrder = tableOrder;
      tableOrder += 1;
      if (field.tableOrder === nextOrder) return field;
      return normalizeEntityField({ ...field, tableOrder: nextOrder });
    });

    return { ...entity, fields: [...nameFields, ...ordered] };
  });
}

export function reorderEntityFieldsInGroup(
  entityId: string,
  groupName: string,
  orderedIds: string[],
) {
  mapEntity(entityId, (entity) => {
    const byId = new Map(entity.fields.map((field) => [field.id, field]));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter(
        (field): field is EntityField =>
          field != null && !isEntityNameField(field),
      );
    const orderedSet = new Set(ordered.map((field) => field.id));
    const nameFields = entity.fields.filter((field) =>
      isEntityNameField(field),
    );
    const next: EntityField[] = [...nameFields];
    let inserted = false;

    for (const field of entity.fields) {
      if (isEntityNameField(field)) continue;
      const belongs =
        getEntityFieldGroupName(field.group) === groupName &&
        orderedSet.has(field.id);
      if (belongs) {
        if (!inserted) {
          next.push(...ordered);
          inserted = true;
        }
        continue;
      }
      next.push(field);
    }

    if (!inserted) next.push(...ordered);
    return { ...entity, fields: next };
  });
}

/** Fields pinned out of the constructor grid (header slot / parent link). */
function getEntityLayoutPinnedFieldIds(entity: Entity) {
  const pinned = new Set<string>();
  if (entity.headerFieldId) pinned.add(entity.headerFieldId);
  if (entity.parentEntityId) {
    for (const field of entity.fields) {
      if (
        field.type === "relation" &&
        getEntityRelationTargetId(field) === entity.parentEntityId
      ) {
        pinned.add(field.id);
      }
    }
  }
  return pinned;
}

/**
 * Maps a visible-grid insert index (header/parent-link excluded) onto the
 * full in-group field list used for persistence.
 */
function mapVisibleGroupInsertIndex(
  targetFields: EntityField[],
  insertIndex: number,
  pinnedIds: Set<string>,
) {
  const visible = targetFields.filter((item) => !pinnedIds.has(item.id));
  const visibleIndex = Math.max(0, Math.min(insertIndex, visible.length));
  if (visibleIndex >= visible.length) {
    let lastVisible = -1;
    for (let i = 0; i < targetFields.length; i += 1) {
      if (!pinnedIds.has(targetFields[i]!.id)) lastVisible = i;
    }
    return lastVisible + 1;
  }
  const anchorId = visible[visibleIndex]!.id;
  return targetFields.findIndex((item) => item.id === anchorId);
}

export function moveEntityFieldToGroup(
  entityId: string,
  fieldId: string,
  targetGroupName: string,
  insertIndex: number,
) {
  mapEntity(entityId, (entity) => {
    const field = entity.fields.find((item) => item.id === fieldId);
    if (!field || isEntityNameField(field)) return entity;

    const groupLabel = targetGroupName.trim() || DEFAULT_ENTITY_FIELD_GROUP;
    const groupValue =
      groupLabel === DEFAULT_ENTITY_FIELD_GROUP ? "" : groupLabel;
    const fieldTabId = getEntityFieldTabId(field);
    const targetFields = entity.fields.filter(
      (item) =>
        item.id !== fieldId &&
        !isEntityNameField(item) &&
        getEntityFieldTabId(item) === fieldTabId &&
        getEntityFieldGroupName(item.group) === groupLabel,
    );
    const pinnedIds = getEntityLayoutPinnedFieldIds(entity);
    const index = mapVisibleGroupInsertIndex(
      targetFields,
      insertIndex,
      pinnedIds,
    );
    const nextColSpan = fitEntityFieldColSpan(
      targetFields,
      fieldId,
      field.colSpan,
      index,
    );
    const moved = normalizeEntityField({
      ...field,
      group: groupValue,
      colSpan: nextColSpan,
    });

    const targetOrdered = [
      ...targetFields.slice(0, index),
      moved,
      ...targetFields.slice(index),
    ];
    const targetIds = new Set(targetOrdered.map((item) => item.id));
    const nameFields = entity.fields.filter((item) => isEntityNameField(item));
    const next: EntityField[] = [...nameFields];
    let inserted = false;

    for (const item of entity.fields) {
      if (item.id === fieldId || isEntityNameField(item)) continue;
      if (targetIds.has(item.id)) {
        if (!inserted) {
          next.push(...targetOrdered);
          inserted = true;
        }
        continue;
      }
      next.push(item);
    }

    if (!inserted) next.push(...targetOrdered);
    return {
      ...entity,
      fields: next,
      fieldGroups: ensureEntityFieldGroups(
        upsertFieldGroup(
          entity.fieldGroups,
          groupLabel,
          ENTITY_FIELD_GROUP_COLUMNS,
          "tab",
          fieldTabId,
        ),
        next,
      ),
    };
  });
}

/** Seed the kanban list column when the create form left it empty. */
function applyKanbanListDefault(
  entity: Entity,
  values: Record<string, string>,
): Record<string, string> {
  const field = getEntityKanbanField(entity);
  if (!field || field.type !== "list") return values;
  const selected = parseEntityListValueIds(values[field.id]);
  if (selected.length > 0) return values;
  const first = resolveEntityListFieldOptions(field, config.entities)[0];
  if (!first) return values;
  return {
    ...values,
    [field.id]: serializeEntityListValueIds([first.id]),
  };
}

/** Drop a ghost local row without calling the delete API. */
function dropEntityRecordLocal(entityId: string, recordId: string) {
  mapEntityLocal(entityId, (entity) => ({
    ...entity,
    records: entity.records.filter((record) => record.id !== recordId),
  }));
}

/**
 * Wait until a just-created record has finished remote insert (or failed).
 * No-op when the record was never pending or Supabase is off.
 */
export function waitForEntityRecordInsert(recordId: string): Promise<void> {
  return pendingRecordInserts.get(recordId) ?? Promise.resolve();
}

function insertRecord(entityId: string, values: Record<string, string>) {
  const entity = config.entities.find((item) => item.id === entityId);
  const withFieldDefaults = entity
    ? applyEntityFieldDefaults(entity, values, getCurrentUserRecordId())
    : values;
  const withFilesDefaults = entity
    ? applyEntityFilesTabDefaults(entity, withFieldDefaults)
    : withFieldDefaults;
  const withDefaults = entity
    ? applyKanbanListDefault(entity, withFilesDefaults)
    : withFilesDefaults;
  const record = normalizeEntityRecord({
    id: createId("record"),
    values: withDefaults,
    authUserId: null,
    createdBy: currentAuthUserId,
  });

  mapEntityLocal(entityId, (current) => ({
    ...current,
    records: [...current.records, record],
  }));

  if (isSupabaseConfigured) {
    markLocalRecordWrite(record.id);
    const persist = insertEntityRecord(entityId, record)
      .then(() => undefined)
      .catch((error: unknown) => {
        dropEntityRecordLocal(entityId, record.id);
        handlePersistError(error, "Не удалось сохранить запись");
        throw new Error(getErrorMessage(error, "Не удалось сохранить запись"));
      })
      .finally(() => {
        pendingRecordInserts.delete(record.id);
      });
    pendingRecordInserts.set(record.id, persist);
  }

  return record;
}

export function addEntityRecord(
  entityId: string,
  values: Record<string, string> = {},
) {
  return insertRecord(entityId, values);
}

/** Starts a timer on the record; the user's running timer is stopped first. */
export function startRecordTimer(entityId: string, recordId: string) {
  const userRecordId = getCurrentUserRecordId();
  const entity = config.entities.find((item) => item.id === entityId);
  const record = entity?.records.find((item) => item.id === recordId);
  const setup = entity ? getEntityTimeTracking(entity, config.entities) : null;
  if (!userRecordId || !entity || !record || !setup) return;
  stopRunningTimer();
  addEntityRecord(
    setup.entryEntity.id,
    buildTimeEntryValues(entity, record, setup, {
      userRecordId,
      start: toLocalDatetime(new Date()),
      method: "timer",
    }),
  );
}

export function stopRunningTimer() {
  const timer = findRunningTimer(config.entities, getCurrentUserRecordId());
  if (!timer) return;
  const end = new Date();
  updateEntityRecord(timer.entryEntity.id, timer.entry.id, {
    ...timer.entry.values,
    [timer.config.endFieldId]: toLocalDatetime(end),
    [timer.config.hoursFieldId]: serializeEntityDecimal(
      getTimeEntryHours(timer.startedAt, end),
    ),
  });
}

/**
 * One entry per business day of the range. Throws when a day would exceed
 * the daily limit (all entries of the employee count).
 */
export function addManualTimeEntries(
  entityId: string,
  recordId: string,
  input: {
    dateFrom: string;
    dateTo: string;
    hoursPerDay: number;
    comment: string;
  },
): number {
  const userRecordId = getCurrentUserRecordId();
  const entity = config.entities.find((item) => item.id === entityId);
  const record = entity?.records.find((item) => item.id === recordId);
  const setup = entity ? getEntityTimeTracking(entity, config.entities) : null;
  if (!userRecordId || !entity || !record || !setup) {
    throw new Error("Учёт времени недоступен для этой записи");
  }
  const plan = planManualTimeEntries({
    ...input,
    dailyLimitHours: setup.config.dailyLimitHours,
    loggedByDay: getLoggedHoursByDay(
      setup.entryEntity,
      setup.config,
      userRecordId,
    ),
  });
  if (plan.overLimitDays.length > 0) {
    throw new Error(
      `Больше ${setup.config.dailyLimitHours} ч в день: ${plan.overLimitDays
        .map(formatDateDisplay)
        .join(", ")}`,
    );
  }
  for (const day of plan.days) {
    const start = parseLocalDatetime(`${day}T09:00:00`)!;
    const end = new Date(start.getTime() + input.hoursPerDay * 3_600_000);
    addEntityRecord(
      setup.entryEntity.id,
      buildTimeEntryValues(entity, record, setup, {
        userRecordId,
        start: toLocalDatetime(start),
        end: toLocalDatetime(end),
        hours: input.hoursPerDay,
        method: "manual",
        comment: input.comment,
      }),
    );
  }
  return plan.days.length;
}

export function setEntityTimeTracking(
  entityId: string,
  timeTracking: EntityTimeTracking | null,
) {
  mapEntity(entityId, (entity) => ({ ...entity, timeTracking }));
}

/** Insert an already-persisted record into local state (e.g. after invite-user). */
export function appendEntityRecord(entityId: string, record: EntityRecord) {
  const normalized = normalizeEntityRecord(record);
  mapEntityLocal(entityId, (entity) => {
    if (entity.records.some((item) => item.id === normalized.id)) {
      return {
        ...entity,
        records: entity.records.map((item) =>
          item.id === normalized.id ? normalized : item,
        ),
      };
    }
    return {
      ...entity,
      records: [...entity.records, normalized],
    };
  });
  return normalized;
}

async function saveRecord(
  entityId: string,
  recordId: string,
  values: Record<string, string>,
): Promise<void> {
  const pendingInsert = pendingRecordInserts.get(recordId);
  if (pendingInsert) {
    await pendingInsert;
  }

  const existing = config.entities
    .find((item) => item.id === entityId)
    ?.records.find((record) => record.id === recordId);
  if (!existing) {
    throw new Error("Запись не найдена");
  }

  // Match SQL `update_entity_record_values`: callers may pass a partial patch
  // (setField, files tab, upload). Replacing the whole local map wiped fields
  // and broke task buttons / lost folder moves after reload.
  const previousValues = existing.values;
  const mergedValues = { ...previousValues, ...values };

  mapEntityLocal(entityId, (entity) => ({
    ...entity,
    records: entity.records.map((record) =>
      record.id === recordId
        ? normalizeEntityRecord({ ...record, values: mergedValues })
        : record,
    ),
  }));

  if (!isSupabaseConfigured) return;

  markLocalRecordWrite(recordId);
  try {
    await updateEntityRecordValues(recordId, values);
  } catch (error: unknown) {
    mapEntityLocal(entityId, (entity) => ({
      ...entity,
      records: entity.records.map((record) =>
        record.id === recordId
          ? normalizeEntityRecord({ ...record, values: previousValues })
          : record,
      ),
    }));
    handlePersistError(error, "Не удалось обновить запись");
    throw error;
  }
}

/** In-memory record values only (no remote persist). Used for optimistic rollback. */
export function setEntityRecordValuesLocal(
  entityId: string,
  recordId: string,
  values: Record<string, string>,
) {
  mapEntityLocal(entityId, (entity) => ({
    ...entity,
    records: entity.records.map((record) =>
      record.id === recordId
        ? normalizeEntityRecord({ ...record, values })
        : record,
    ),
  }));
}

export function updateEntityRecord(
  entityId: string,
  recordId: string,
  values: Record<string, string>,
): Promise<void> {
  return saveRecord(entityId, recordId, values);
}

/**
 * Moves a timeline bar and reschedules dependent records.
 * Returns how many other records moved; throws on dependency cycles.
 */
export function rescheduleEntityRecord(
  entityId: string,
  recordId: string,
  start: string,
  end: string,
): number {
  const entity = config.entities.find((item) => item.id === entityId);
  const setup = entity ? getEntityTimelineSetup(entity) : null;
  if (!entity || !setup) return 0;
  const changes = scheduleEntityTimeline({
    setup,
    records: entity.records,
    rootRecordId: recordId,
    start,
    end,
  });
  for (const change of changes) {
    const record = entity.records.find((item) => item.id === change.recordId);
    if (!record) continue;
    updateEntityRecord(entityId, record.id, {
      ...record.values,
      [setup.startField.id]: withEntityDatePart(
        record.values[setup.startField.id],
        change.start,
      ),
      [setup.endField.id]: withEntityDatePart(
        record.values[setup.endField.id],
        change.end,
      ),
    });
  }
  return changes.filter((change) => change.recordId !== recordId).length;
}

/** Save timeline settings and flush to remote immediately (avoids refresh race). */
export function setEntityTimeline(
  entityId: string,
  timeline: EntityTimelineConfig | null,
) {
  mapEntity(entityId, (entity) => ({ ...entity, timeline }));
  if (!schemaEditSession) {
    flushStructureToRemote(true);
  }
}

export function setEntityPageLayout(
  entityId: string,
  pageLayout: EntityPageLayout | null,
) {
  mapEntity(entityId, (entity) => ({ ...entity, pageLayout }));
  if (!schemaEditSession) {
    flushStructureToRemote(true);
  }
}

export function removeEntityRecord(entityId: string, recordId: string) {
  let structureChanged = false;
  const entities = config.entities.map((entity) => {
    const nextRecords =
      entity.id === entityId
        ? entity.records.filter((record) => record.id !== recordId)
        : entity.records;

    const nextFields = entity.fields.map((field) => {
      if (field.type !== "list") return field;
      const listOptions = field.listOptions.filter(
        (option) => option.parentOptionId !== recordId,
      );
      if (listOptions.length === field.listOptions.length) return field;
      structureChanged = true;
      return normalizeEntityField({ ...field, listOptions });
    });

    const recordsChanged = nextRecords !== entity.records;
    const fieldsChanged = nextFields.some(
      (field, index) => field !== entity.fields[index],
    );
    if (!recordsChanged && !fieldsChanged) return entity;

    return normalizeEntity({
      ...entity,
      records: nextRecords,
      fields: nextFields,
    });
  });

  if (structureChanged) {
    persistStructure({ entities });
  } else {
    setLocalConfig({ entities });
  }

  if (!isSupabaseConfigured) return;

  markLocalRecordWrite(recordId);
  void deleteEntityRecord(recordId).catch((error: unknown) => {
    handlePersistError(error, "Не удалось удалить запись");
  });
}
