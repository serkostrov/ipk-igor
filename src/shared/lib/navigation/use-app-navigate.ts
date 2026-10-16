import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  locationsEqual,
  menuIdToLocation,
  parsePath,
  recordLocation,
  taskLocation,
  toPath,
  type AppLocation,
  type AppLocationState,
} from "./paths";

function historyIndex(): number {
  const state = window.history.state as { idx?: number } | null;
  return typeof state?.idx === "number" ? state.idx : 0;
}

export function useAppLocation(): AppLocation {
  const { pathname } = useLocation();
  return useMemo(() => parsePath(pathname) ?? { type: "settings" }, [pathname]);
}

export function useAppLocationState(): AppLocationState | null {
  const { state } = useLocation();
  if (state == null || typeof state !== "object") return null;
  return state as AppLocationState;
}

export function useAppNavigate() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const current = useAppLocation();
  const hasRouterState = routerLocation.state != null;

  const go = useCallback(
    (location: AppLocation, state?: AppLocationState) => {
      if (
        locationsEqual(current, location) &&
        state == null &&
        !hasRouterState
      ) {
        return;
      }
      navigate(toPath(location), {
        state: state ?? null,
      });
    },
    [navigate, current, hasRouterState],
  );

  const replace = useCallback(
    (location: AppLocation, state?: AppLocationState) => {
      if (
        locationsEqual(current, location) &&
        state == null &&
        !hasRouterState
      ) {
        return;
      }
      navigate(toPath(location), {
        replace: true,
        state: state ?? null,
      });
    },
    [navigate, current, hasRouterState],
  );

  const back = useCallback(
    (fallback: AppLocation) => {
      if (historyIndex() > 0) {
        navigate(-1);
        return;
      }
      navigate(toPath(fallback), { replace: true });
    },
    [navigate],
  );

  const goMenu = useCallback(
    (menuId: string) => {
      const target = menuIdToLocation(menuId);
      // Re-clicking the same entity while on a record → list (replace so Back
      // does not return to the dismissed card).
      if (
        (current.type === "record" || current.type === "entity") &&
        target.type === "entity" &&
        current.entityId === target.entityId
      ) {
        if (current.type === "record") {
          replace(target);
        }
        return;
      }
      // Re-clicking tasks while on a task → list.
      if (
        (current.type === "task" || current.type === "tasks") &&
        target.type === "tasks"
      ) {
        if (current.type === "task") {
          replace(target);
        }
        return;
      }
      go(target);
    },
    [current, go, replace],
  );

  const openRecord = useCallback(
    (entityId: string, recordId: string, options?: { edit?: boolean }) => {
      if (options?.edit) {
        // Internal entities: stay on list URL, open dialog via state.
        go({ type: "entity", entityId }, { editRecordId: recordId });
        return;
      }
      go(recordLocation(entityId, recordId));
    },
    [go],
  );

  const openTask = useCallback(
    (taskId: string) => {
      go(taskLocation(taskId));
    },
    [go],
  );

  return { go, replace, back, goMenu, openRecord, openTask, current };
}
