import { isSupabaseConfigured } from "@/shared/api/supabase";
import { getErrorMessage } from "@/shared/lib/error-message";
import {
  SYSTEM_USERS_ENTITY_ID,
  SYSTEM_USERS_FIELD_ROLE_ID,
  findSystemUserByAuthId,
  getCurrentUserRecordId,
  getEntityConfig,
  getEntityValueContext,
  parseEntityListValueIds,
  setEntityRecordMutationGuard,
  syncUsersRoleOptions,
  updateEntityRecord,
} from "@/entities/entity";
import { fetchRolesConfig, saveRolesConfig } from "../api/roles-config-api";
import {
  cloneDefaultRolesConfig,
  ensureSystemRoles,
  toRolesDocument,
} from "../lib/parse-roles-config";
import {
  canEntity,
  canViewRecordForDataScope,
  canViewRecordForLegalEntities,
} from "../model/permissions";
import {
  ROLE_ADMIN_ID,
  ROLE_EMPLOYEE_ID,
  type Role,
  type RolesConfig,
} from "../model/types";

/** Users «Роль» is a list field — values may be CSV / JSON-array encoded. */
function resolveProfileRoleId(
  values: Record<string, string> | null | undefined,
): string {
  return (
    parseEntityListValueIds(values?.[SYSTEM_USERS_FIELD_ROLE_ID])[0]?.trim() ??
    ""
  );
}

function installRecordMutationGuard() {
  setEntityRecordMutationGuard(async (entityId, action, record) => {
    if (!canEntity(currentRole, entityId, action)) return false;
    if (action === "create") return true;
    if (!record) return false;
    const entities = getEntityConfig().entities;
    const entity = entities.find((item) => item.id === entityId);
    if (!entity) return false;
    const currentUserRecordId = getCurrentUserRecordId();
    const scopeOptions = {
      entities,
      authUserId: currentAuthUserId,
      currentUserRecordId,
      valueContext: getEntityValueContext(entities, currentUserRecordId),
    };
    if (
      !(await canViewRecordForDataScope(
        currentRole,
        entity,
        record,
        scopeOptions,
      ))
    ) {
      return false;
    }
    return canViewRecordForLegalEntities(currentRole, entity, record, entities);
  });
}

export type AccessStatus = "idle" | "loading" | "ready" | "error";

/** Result of a role write. `ok` only after the database row matches the write. */
export type RoleSaveResult = { ok: true } | { ok: false; message: string };

type Listener = () => void;

let config: RolesConfig = cloneDefaultRolesConfig();
/** Last document confirmed to match `app_documents`. Optimistic edits stay out. */
let confirmed: RolesConfig = cloneDefaultRolesConfig();
let currentRole: Role | null = null;
let currentAuthUserId: string | null = null;
let status: AccessStatus = "idle";
let errorMessage: string | null = null;
let initPromise: Promise<void> | null = null;

const listeners = new Set<Listener>();

function notify() {
  installRecordMutationGuard();
  listeners.forEach((listener) => listener());
}

function setStatus(next: AccessStatus, message: string | null = null) {
  status = next;
  errorMessage = message;
  notify();
}

function resolveCurrentRole(authUserId: string | null): Role | null {
  const admin = config.roles.find((role) => role.id === ROLE_ADMIN_ID) ?? null;
  const employee =
    config.roles.find((role) => role.id === ROLE_EMPLOYEE_ID) ?? null;

  // Offline / no session — full local access.
  if (!authUserId) {
    return isSupabaseConfigured ? null : admin;
  }

  const entities = getEntityConfig().entities;
  const profile = findSystemUserByAuthId(entities, authUserId);
  // Users records not loaded yet — deny (do not elevate to employee `entities:"*"`).
  if (!profile) return null;

  const roleId = resolveProfileRoleId(profile.values);
  if (!roleId) {
    // Empty role field: least-privilege session until ensureProfileRole assigns.
    return employee;
  }
  const found = config.roles.find((role) => role.id === roleId) ?? null;
  // Unknown id must not silently become Employee (full CRUD via entities:"*").
  return found;
}

/** Persist plain role id when the Users field still holds list encoding. */
function healProfileRoleEncoding(
  profileId: string,
  values: Record<string, string>,
) {
  const raw = values[SYSTEM_USERS_FIELD_ROLE_ID] ?? "";
  const roleId = resolveProfileRoleId(values);
  if (!roleId || raw === roleId) return;
  if (!config.roles.some((role) => role.id === roleId)) return;
  void updateEntityRecord(SYSTEM_USERS_ENTITY_ID, profileId, {
    ...values,
    [SYSTEM_USERS_FIELD_ROLE_ID]: roleId,
  }).catch((error: unknown) => {
    console.error("[access] profile role repair skipped", error);
  });
}

function publishRoles(next: RolesConfig) {
  const ensured = ensureSystemRoles(next.roles);
  config = { roles: ensured.roles };
  syncUsersRoleOptions(
    config.roles.map((role) => ({ id: role.id, name: role.name })),
  );
  currentRole = resolveCurrentRole(currentAuthUserId);
  notify();
}

function rememberConfirmed(next: RolesConfig) {
  confirmed = structuredClone(toRolesDocument(next));
}

function restoreConfirmed() {
  publishRoles(confirmed);
}

/** Canonical JSON: object key order does not matter, role order does. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameRolesDocument(left: RolesConfig, right: RolesConfig): boolean {
  return stableJson(left) === stableJson(right);
}

let persistTail: Promise<void> = Promise.resolve();
let persistPending = false;

/**
 * Write the latest roles document, then read it back.
 * A newer edit sets `persistPending` and is written by the same loop, so an
 * older request cannot finish last and overwrite it.
 */
async function flushPendingRoles(): Promise<void> {
  while (persistPending) {
    persistPending = false;
    const document = toRolesDocument(config);
    try {
      await saveRolesConfig(document);
      const remote = await fetchRolesConfig();
      const stored = remote ? toRolesDocument(remote) : null;
      if (!stored || !sameRolesDocument(stored, document)) {
        throw new Error("Изменения не записались в базу");
      }
      rememberConfirmed(stored);
      if (!persistPending) publishRoles(stored);
    } catch (error) {
      if (!persistPending) restoreConfirmed();
      throw error;
    }
  }
}

function schedulePersist(): Promise<RoleSaveResult> {
  if (!isSupabaseConfigured) {
    rememberConfirmed(config);
    return Promise.resolve({ ok: true });
  }

  persistPending = true;
  const job = persistTail.then(flushPendingRoles);
  persistTail = job.then(
    () => undefined,
    () => undefined,
  );
  return job.then(
    () => {
      setStatus("ready");
      return { ok: true };
    },
    (error: unknown) => {
      const raw = getErrorMessage(error, "Не удалось сохранить роли");
      const message = /failed to fetch|networkerror|load failed/i.test(raw)
        ? "Нет связи с базой. Изменения не записались"
        : raw;
      console.error("[access] save roles failed", error);
      setStatus("error", message);
      return { ok: false, message };
    },
  );
}

function applyRoles(
  next: RolesConfig,
  persistRemote: boolean,
): Promise<RoleSaveResult> {
  publishRoles(next);
  if (!persistRemote) return Promise.resolve({ ok: true });
  return schedulePersist();
}

/**
 * Assign Employee only when the role field is empty.
 * Never overwrite a non-empty value (encoded list / temporarily unknown id).
 */
async function ensureProfileRole(authUserId: string) {
  const entities = getEntityConfig().entities;
  const profile = findSystemUserByAuthId(entities, authUserId);
  if (!profile) return;

  const roleId = resolveProfileRoleId(profile.values);
  if (roleId) {
    healProfileRoleEncoding(profile.id, profile.values);
    return;
  }

  void updateEntityRecord(SYSTEM_USERS_ENTITY_ID, profile.id, {
    ...profile.values,
    [SYSTEM_USERS_FIELD_ROLE_ID]: ROLE_EMPLOYEE_ID,
  }).catch((error: unknown) => {
    console.error("[access] default role assignment skipped", error);
  });
}

export function getRolesConfig() {
  return config;
}

export function getCurrentRole() {
  return currentRole;
}

export function getAccessStatus() {
  return status;
}

export function getAccessError() {
  return errorMessage;
}

export function subscribeAccess(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAccessAuthUserId(authUserId: string | null) {
  currentAuthUserId = authUserId;
  currentRole = resolveCurrentRole(authUserId);
  notify();
}

/** Re-resolve role after Users profile / records change. */
export function refreshCurrentRole() {
  currentRole = resolveCurrentRole(currentAuthUserId);
  notify();
}

export async function initAccessConfig(authUserId?: string | null) {
  if (authUserId !== undefined) {
    currentAuthUserId = authUserId;
  }

  if (initPromise) {
    await initPromise;
    currentRole = resolveCurrentRole(currentAuthUserId);
    notify();
    return;
  }

  initPromise = (async () => {
    setStatus("loading");
    try {
      const remote = await fetchRolesConfig();
      const next = remote ?? cloneDefaultRolesConfig();
      const ensured = ensureSystemRoles(next.roles);
      config = { roles: ensured.roles };
      rememberConfirmed(config);
      syncUsersRoleOptions(
        config.roles.map((role) => ({ id: role.id, name: role.name })),
      );

      if (isSupabaseConfigured && (remote == null || ensured.changed)) {
        void schedulePersist();
      }

      if (currentAuthUserId) {
        try {
          await ensureProfileRole(currentAuthUserId);
        } catch (error: unknown) {
          console.error("[access] ensure profile role failed", error);
        }
      }

      currentRole = resolveCurrentRole(currentAuthUserId);
      setStatus("ready");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось загрузить роли";
      console.error("[access] load failed", error);
      config = cloneDefaultRolesConfig();
      syncUsersRoleOptions(
        config.roles.map((role) => ({ id: role.id, name: role.name })),
      );
      currentRole = resolveCurrentRole(currentAuthUserId);
      setStatus("error", message);
    }
  })();

  return initPromise;
}

export function setRolesConfig(next: RolesConfig): Promise<RoleSaveResult> {
  return applyRoles(next, true);
}

export function upsertRole(role: Role): Promise<RoleSaveResult> {
  const exists = config.roles.some((item) => item.id === role.id);
  const roles = exists
    ? config.roles.map((item) => (item.id === role.id ? role : item))
    : [...config.roles, role];
  return applyRoles({ roles }, true);
}

export function removeRole(roleId: string): Promise<RoleSaveResult> {
  if (roleId === ROLE_ADMIN_ID) return Promise.resolve({ ok: true });
  return applyRoles(
    { roles: config.roles.filter((role) => role.id !== roleId) },
    true,
  );
}

export function cloneRole(roleId: string): Role | null {
  const source = config.roles.find((role) => role.id === roleId);
  if (!source) return null;
  const cloned: Role = {
    ...structuredClone(source),
    id: `role-${crypto.randomUUID()}`,
    name: `${source.name} (копия)`,
    isSystem: false,
  };
  void applyRoles({ roles: [...config.roles, cloned] }, true);
  return cloned;
}

export { ROLE_ADMIN_ID, ROLE_EMPLOYEE_ID };
