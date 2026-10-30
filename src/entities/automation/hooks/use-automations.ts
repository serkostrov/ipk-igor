import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getAutomationConfig,
  getAutomationError,
  getAutomationStatus,
  initAutomationConfig,
  subscribeAutomationConfig,
} from "../store/automation-store";

export function useAutomationConfig() {
  return useSyncExternalStore(
    subscribeAutomationConfig,
    getAutomationConfig,
    getAutomationConfig,
  );
}

export function useAutomationStatus() {
  const status = useSyncExternalStore(
    subscribeAutomationConfig,
    getAutomationStatus,
    getAutomationStatus,
  );
  const requestedIdleInitRef = useRef(false);
  // After HMR the store resets to `idle` while AppShell does not re-run init.
  useEffect(() => {
    if (status !== "idle") {
      requestedIdleInitRef.current = false;
      return;
    }
    if (requestedIdleInitRef.current) return;
    requestedIdleInitRef.current = true;
    void initAutomationConfig();
  }, [status]);
  return status;
}

export function useAutomationError() {
  return useSyncExternalStore(
    subscribeAutomationConfig,
    getAutomationError,
    getAutomationError,
  );
}
