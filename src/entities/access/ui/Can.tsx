import type { ReactNode } from "react";
import {
  canAccessAutomationTasks,
  canAccessHistory,
  canAccessNotifications,
  canAccessSettings,
  canEntity,
  canField,
  canInviteUsers,
  canMenuItem,
  canSettingsTab,
} from "../model/permissions";
import type {
  EntityAction,
  FieldAccessMode,
  SettingsTabId,
} from "../model/types";
import { useCurrentRole } from "../hooks/use-access";

type CanProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

export function CanSettingsTab({
  tab,
  children,
  fallback = null,
}: CanProps & { tab: SettingsTabId }) {
  const role = useCurrentRole();
  return canSettingsTab(role, tab) ? <>{children}</> : <>{fallback}</>;
}

export function CanAccessSettings({ children, fallback = null }: CanProps) {
  const role = useCurrentRole();
  return canAccessSettings(role) ? <>{children}</> : <>{fallback}</>;
}

export function CanInviteUsers({ children, fallback = null }: CanProps) {
  const role = useCurrentRole();
  return canInviteUsers(role) ? <>{children}</> : <>{fallback}</>;
}

export function CanAccessHistory({ children, fallback = null }: CanProps) {
  const role = useCurrentRole();
  return canAccessHistory(role) ? <>{children}</> : <>{fallback}</>;
}

export function CanAccessAutomationTasks({
  children,
  fallback = null,
}: CanProps) {
  const role = useCurrentRole();
  return canAccessAutomationTasks(role) ? <>{children}</> : <>{fallback}</>;
}

export function CanAccessNotifications({
  children,
  fallback = null,
}: CanProps) {
  const role = useCurrentRole();
  return canAccessNotifications(role) ? <>{children}</> : <>{fallback}</>;
}

export function CanEntity({
  entityId,
  action,
  children,
  fallback = null,
}: CanProps & { entityId: string; action: EntityAction }) {
  const role = useCurrentRole();
  return canEntity(role, entityId, action) ? <>{children}</> : <>{fallback}</>;
}

export function CanField({
  entityId,
  fieldId,
  mode,
  children,
  fallback = null,
}: CanProps & {
  entityId: string;
  fieldId: string;
  mode: FieldAccessMode;
}) {
  const role = useCurrentRole();
  return canField(role, entityId, fieldId, mode) ? (
    <>{children}</>
  ) : (
    <>{fallback}</>
  );
}

export function CanMenuItem({
  menuItemId,
  entityId,
  children,
  fallback = null,
}: CanProps & { menuItemId: string; entityId?: string | null }) {
  const role = useCurrentRole();
  return canMenuItem(role, menuItemId, entityId) ? (
    <>{children}</>
  ) : (
    <>{fallback}</>
  );
}
