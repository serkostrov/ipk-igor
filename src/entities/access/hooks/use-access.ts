import { useSyncExternalStore } from "react";
import {
  automationTasksScope,
  canAccessAutomationTasks,
  canDeleteAutomationTasks,
  canAccessHistory,
  canAccessNotifications,
  canAccessSettings,
  canEntity,
  canField,
  canInviteUsers,
  canMenuItem,
  canSettingsTab,
  entityScope,
  isAdminRole,
} from "../model/permissions";
import type {
  EntityAction,
  FieldAccessMode,
  Role,
  SettingsTabId,
} from "../model/types";
import {
  getAccessError,
  getAccessStatus,
  getCurrentRole,
  getRolesConfig,
  subscribeAccess,
  type AccessStatus,
} from "../store/access-store";

type AccessSnapshot = {
  status: AccessStatus;
  error: string | null;
  roles: Role[];
  role: Role | null;
};

let accessSnapshot: AccessSnapshot = {
  status: getAccessStatus(),
  error: getAccessError(),
  roles: getRolesConfig().roles,
  role: getCurrentRole(),
};

function getAccessSnapshot(): AccessSnapshot {
  const status = getAccessStatus();
  const error = getAccessError();
  const roles = getRolesConfig().roles;
  const role = getCurrentRole();
  if (
    accessSnapshot.status === status &&
    accessSnapshot.error === error &&
    accessSnapshot.roles === roles &&
    accessSnapshot.role === role
  ) {
    return accessSnapshot;
  }
  accessSnapshot = { status, error, roles, role };
  return accessSnapshot;
}

function useAccessStore() {
  return useSyncExternalStore(
    subscribeAccess,
    getAccessSnapshot,
    getAccessSnapshot,
  );
}

export function useAccessStatus() {
  return useAccessStore().status;
}

export function useAccessError() {
  return useAccessStore().error;
}

export function useRoles() {
  return useAccessStore().roles;
}

export function useCurrentRole() {
  return useAccessStore().role;
}

export function useIsAdmin() {
  return isAdminRole(useCurrentRole());
}

export function useCanEntity(entityId: string, action: EntityAction) {
  return canEntity(useCurrentRole(), entityId, action);
}

export function useCanField(
  entityId: string,
  fieldId: string,
  mode: FieldAccessMode,
) {
  return canField(useCurrentRole(), entityId, fieldId, mode);
}

export function useEntityScope(entityId: string) {
  return entityScope(useCurrentRole(), entityId);
}

export function useCanSettingsTab(tab: SettingsTabId) {
  return canSettingsTab(useCurrentRole(), tab);
}

export function useCanAccessSettings() {
  return canAccessSettings(useCurrentRole());
}

export function useCanInviteUsers() {
  return canInviteUsers(useCurrentRole());
}

export function useCanAccessHistory() {
  return canAccessHistory(useCurrentRole());
}

export function useCanAccessAutomationTasks() {
  return canAccessAutomationTasks(useCurrentRole());
}

export function useCanDeleteAutomationTasks() {
  return canDeleteAutomationTasks(useCurrentRole());
}

export function useAutomationTasksScope() {
  return automationTasksScope(useCurrentRole());
}

export function useCanAccessNotifications() {
  return canAccessNotifications(useCurrentRole());
}

export function useCanMenuItem(
  menuItemId: string,
  entityIdForItem?: string | null,
) {
  return canMenuItem(useCurrentRole(), menuItemId, entityIdForItem);
}
