import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  SYSTEM_USERS_ENTITY_ID,
  SYSTEM_USERS_FIELD_ROLE_ID,
  findSystemUserByAuthId,
  getEntityConfig,
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
  ROLE_ADMIN_ID,
  ROLE_EMPLOYEE_ID,
  type Role,
  type RolesConfig,
} from "../model/types";

export type AccessStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

let config: RolesConfig = cloneDefaultRolesConfig();
let currentRole: Role | null = null;
let currentAuthUserId: string | null = null;
let status: AccessStatus = "idle";
let errorMessage: string | null = null;
let initPromise: Promise<void> | null = null;

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: AccessStatus, message: string | null = null) {
  status = next;
  errorMessage = message;
  notify();
}

function resolveCurrentRole(authUserId: string | null): Role | null {
  const admin = config.roles.find((role) => role.id === ROLE_ADMIN_ID) ?? null;

  // Offline / no session — full local access.
  if (!authUserId) {
    return isSupabaseConfigured ? null : admin;
  }

  const entities = getEntityConfig().entities;
  const profile = findSystemUserByAuthId(entities, authUserId);
  const roleId =
    profile?.values[SYSTEM_USERS_FIELD_ROLE_ID]?.trim() || ROLE_ADMIN_ID;
  return config.roles.find((role) => role.id === roleId) ?? admin;
}

function applyRoles(next: RolesConfig, persistRemote: boolean) {
  const ensured = ensureSystemRoles(next.roles);
  config = { roles: ensured.roles };
  syncUsersRoleOptions(
    config.roles.map((role) => ({ id: role.id, name: role.name })),
  );
  currentRole = resolveCurrentRole(currentAuthUserId);
  notify();

  if (!persistRemote || !isSupabaseConfigured) return;

  void saveRolesConfig(toRolesDocument(config)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Не удалось сохранить роли";
    console.error("[access] save roles failed", error);
    setStatus("error", message);
  });
}

/** Assign Administrator to the current profile when role is missing. */
async function ensureProfileRole(authUserId: string) {
  const entities = getEntityConfig().entities;
  const profile = findSystemUserByAuthId(entities, authUserId);
  if (!profile) return;
  const roleId = profile.values[SYSTEM_USERS_FIELD_ROLE_ID]?.trim() ?? "";
  if (roleId && config.roles.some((role) => role.id === roleId)) return;

  const nextRoleId = ROLE_ADMIN_ID;
  updateEntityRecord(SYSTEM_USERS_ENTITY_ID, profile.id, {
    ...profile.values,
    [SYSTEM_USERS_FIELD_ROLE_ID]: nextRoleId,
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
      syncUsersRoleOptions(
        config.roles.map((role) => ({ id: role.id, name: role.name })),
      );

      if (isSupabaseConfigured && (remote == null || ensured.changed)) {
        void saveRolesConfig(toRolesDocument(config)).catch(
          (error: unknown) => {
            const message =
              error instanceof Error
                ? error.message
                : "Не удалось сохранить роли";
            console.error("[access] save roles failed", error);
            setStatus("error", message);
          },
        );
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

export function setRolesConfig(next: RolesConfig) {
  applyRoles(next, true);
  setStatus("ready");
}

export function upsertRole(role: Role) {
  const exists = config.roles.some((item) => item.id === role.id);
  const roles = exists
    ? config.roles.map((item) => (item.id === role.id ? role : item))
    : [...config.roles, role];
  applyRoles({ roles }, true);
}

export function removeRole(roleId: string) {
  if (roleId === ROLE_ADMIN_ID || roleId === ROLE_EMPLOYEE_ID) return;
  applyRoles(
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
  applyRoles({ roles: [...config.roles, cloned] }, true);
  return cloned;
}

export { ROLE_ADMIN_ID, ROLE_EMPLOYEE_ID };
