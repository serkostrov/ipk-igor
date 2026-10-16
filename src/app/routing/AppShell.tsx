import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SYSTEM_USERS_ENTITY_ID,
  appendEntityRecord,
  ensureCurrentUserProfile,
  initEntityConfig,
  isEntityInternal,
  setCurrentAuthUserId,
  subscribeEntityConfig,
  useEntityConfig,
  useEntityStatus,
  type Entity,
  type EntityStatus,
} from "@/entities/entity";
import { initMenuConfig, useMenuConfig, useMenuStatus } from "@/entities/menu";
import {
  menuLooksUnnested,
  restoreDepartmentMenu,
} from "@/features/customize-menu/lib/restore-department-menu";
import { initAutomationConfig } from "@/entities/automation";
import { initNotificationConfig } from "@/entities/notification";
import {
  canAccessAutomationTasks,
  canAccessHistory,
  canAccessNotifications,
  canAccessSettings,
  canEntity,
  canMenuItem,
  initAccessConfig,
  refreshCurrentRole,
  setAccessAuthUserId,
  useAccessStatus,
  useCurrentRole,
} from "@/entities/access";
import { getSessionUser, useSessionUser } from "@/entities/session";
import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  locationToMenuId,
  locationsEqual,
  menuIdToLocation,
  parsePath,
  useAppLocation,
  useAppNavigate,
  type AppLocation,
} from "@/shared/lib/navigation";
import {
  AutomationTasksHost,
  AutomationTasksPage,
} from "@/pages/automation-tasks";
import { EntityPage } from "@/pages/entity";
import { HistoryPage } from "@/pages/history";
import { NotificationsPage } from "@/pages/notifications";
import { SettingsPage } from "@/pages/settings";
import { NotificationsHost } from "@/widgets/notifications";
import { Sidebar } from "@/widgets/sidebar";
import { useLocation } from "react-router-dom";

function resolveLocation(
  location: AppLocation,
  entities: Entity[],
  entityStatus: EntityStatus,
): AppLocation {
  if (location.type === "entity" || location.type === "record") {
    if (entityStatus !== "ready" && entityStatus !== "error") return location;
    if (entities.some((entity) => entity.id === location.entityId)) {
      return location;
    }
    return { type: "settings" };
  }
  return location;
}

function isLocationAllowed(
  location: AppLocation,
  role: ReturnType<typeof useCurrentRole>,
): boolean {
  if (!role) return true;
  if (location.type === "settings") return canAccessSettings(role);
  if (location.type === "history") return canAccessHistory(role);
  if (location.type === "tasks" || location.type === "task") {
    return canAccessAutomationTasks(role);
  }
  if (location.type === "notifications") return canAccessNotifications(role);
  if (location.type === "entity" || location.type === "record") {
    return (
      canMenuItem(role, location.entityId, location.entityId) &&
      canEntity(role, location.entityId, "read")
    );
  }
  return true;
}

function firstAllowedLocation(
  role: ReturnType<typeof useCurrentRole>,
  entities: Entity[],
): AppLocation {
  if (role && canAccessSettings(role)) return { type: "settings" };
  if (role && canAccessHistory(role)) return { type: "history" };
  if (role && canAccessAutomationTasks(role)) return { type: "tasks" };
  if (role && canAccessNotifications(role)) return { type: "notifications" };
  for (const entity of entities) {
    if (
      role &&
      canMenuItem(role, entity.id, entity.id) &&
      canEntity(role, entity.id, "read")
    ) {
      return { type: "entity", entityId: entity.id };
    }
  }
  return { type: "settings" };
}

export function AppShell() {
  const { pathname } = useLocation();
  const location = useAppLocation();
  const { replace, goMenu, openRecord } = useAppNavigate();
  const { entities } = useEntityConfig();
  const entityStatus = useEntityStatus();
  const menuConfig = useMenuConfig();
  const menuStatus = useMenuStatus();
  const sessionUser = useSessionUser();
  const authUserId = sessionUser?.id ?? null;
  const role = useCurrentRole();
  const accessStatus = useAccessStatus();
  const didRestoreMenuRef = useRef(false);
  const bootstrapGenRef = useRef(0);
  // Always start closed: menu/entity stores default to `loading` and must be
  // initialized (including offline defaults when Supabase env is missing).
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (didRestoreMenuRef.current) return;
    if (menuStatus !== "ready" || entityStatus !== "ready") return;
    if (entities.length === 0) return;
    if (!menuLooksUnnested(menuConfig)) return;
    didRestoreMenuRef.current = true;
    restoreDepartmentMenu(entities);
  }, [entities, entityStatus, menuConfig, menuStatus]);

  const resolved = useMemo(
    () => resolveLocation(location, entities, entityStatus),
    [location, entities, entityStatus],
  );

  const accessResolved = useMemo(() => {
    if (accessStatus !== "ready" && accessStatus !== "error") return resolved;
    if (isLocationAllowed(resolved, role)) return resolved;
    return firstAllowedLocation(role, entities);
  }, [accessStatus, resolved, role, entities]);

  useEffect(() => {
    if (parsePath(pathname) == null) {
      replace({ type: "settings" });
      return;
    }
    if (locationsEqual(accessResolved, location)) return;
    replace(accessResolved);
  }, [pathname, accessResolved, location, replace]);

  useEffect(() => {
    setCurrentAuthUserId(authUserId);
    setAccessAuthUserId(authUserId);
  }, [authUserId]);

  useEffect(() => {
    const unsubscribe = subscribeEntityConfig(() => {
      refreshCurrentRole();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const gen = ++bootstrapGenRef.current;

    const withTimeout = (promise: Promise<unknown>, ms: number) =>
      Promise.race([
        promise,
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, ms);
        }),
      ]);

    // Hard cap so CORS / hung fetches cannot leave the shell on «Загрузка…».
    const forceOpenTimer = window.setTimeout(() => {
      if (bootstrapGenRef.current === gen) setBootstrapped(true);
    }, 6_000);

    // Defer reset so we don't call setState synchronously in the effect body
    // (react-hooks/set-state-in-effect). Re-run on auth user change.
    const resetTimer = window.setTimeout(() => {
      if (bootstrapGenRef.current === gen) setBootstrapped(false);
    }, 0);

    void (async () => {
      try {
        // Always init — when Supabase is off, stores load local defaults and
        // leave `loading` (otherwise sidebar/settings stay on skeletons forever).
        await withTimeout(initMenuConfig(), 4_000);

        // Non-critical: never block the shell on CORS / missing tables.
        if (isSupabaseConfigured) {
          void initAutomationConfig();
          void initNotificationConfig();
        }

        await withTimeout(
          initEntityConfig().catch((error: unknown) => {
            console.error("[app] entity bootstrap failed", error);
          }),
          4_000,
        );

        if (isSupabaseConfigured && authUserId) {
          const user = getSessionUser();
          try {
            await withTimeout(
              ensureCurrentUserProfile({
                authUserId,
                email: user?.email ?? null,
                fullName:
                  typeof user?.user_metadata?.full_name === "string"
                    ? user.user_metadata.full_name
                    : null,
              }).then((profile) => {
                if (profile && bootstrapGenRef.current === gen) {
                  appendEntityRecord(SYSTEM_USERS_ENTITY_ID, profile);
                }
              }),
              3_000,
            );
          } catch (error: unknown) {
            console.error("[session] ensure user profile failed", error);
          }
        }

        await withTimeout(initAccessConfig(authUserId), 3_000);
      } catch (error: unknown) {
        console.error("[app] bootstrap failed", error);
        try {
          await withTimeout(initAccessConfig(authUserId), 2_000);
        } catch (accessError: unknown) {
          console.error("[app] access bootstrap failed", accessError);
        }
      } finally {
        window.clearTimeout(forceOpenTimer);
        if (bootstrapGenRef.current === gen) setBootstrapped(true);
      }
    })();

    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(forceOpenTimer);
    };
  }, [authUserId]);

  const handleOpenRecord = useCallback(
    (entityId: string, recordId: string) => {
      if (role && !canEntity(role, entityId, "read")) return;
      const entity = entities.find((item) => item.id === entityId);
      if (entity && isEntityInternal(entity)) {
        openRecord(entityId, recordId, { edit: true });
        return;
      }
      openRecord(entityId, recordId);
    },
    [entities, openRecord, role],
  );

  const handleNavigate = useCallback(
    (menuId: string) => {
      const next = menuIdToLocation(menuId);
      if (!isLocationAllowed(next, role)) return;
      goMenu(menuId);
    },
    [goMenu, role],
  );

  const activeId = locationToMenuId(accessResolved);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <NotificationsHost />
      <AutomationTasksHost />
      <Sidebar
        activeId={activeId}
        onNavigate={handleNavigate}
        onOpenRecord={handleOpenRecord}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {accessResolved.type === "settings" ? (
          <SettingsPage onOpenEntity={goMenu} />
        ) : accessResolved.type === "entity" ||
          accessResolved.type === "record" ? (
          <EntityPage
            key={accessResolved.entityId}
            entityId={accessResolved.entityId}
            recordId={
              accessResolved.type === "record" ? accessResolved.recordId : null
            }
            onOpenRelation={handleOpenRecord}
          />
        ) : accessResolved.type === "history" ? (
          <HistoryPage onOpenRecord={handleOpenRecord} />
        ) : accessResolved.type === "tasks" ||
          accessResolved.type === "task" ? (
          <AutomationTasksPage
            taskId={
              accessResolved.type === "task" ? accessResolved.taskId : null
            }
            onOpenRecord={handleOpenRecord}
          />
        ) : accessResolved.type === "notifications" ? (
          <NotificationsPage
            onOpenRecord={handleOpenRecord}
            onOpenTasks={() => goMenu("automation-tasks")}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Раздел</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Страница этого пункта меню пока не настроена.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
