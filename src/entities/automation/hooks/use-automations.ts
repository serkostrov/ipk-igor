import { useSyncExternalStore } from "react";
import {
  getAutomationConfig,
  getAutomationError,
  getAutomationStatus,
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
  return useSyncExternalStore(
    subscribeAutomationConfig,
    getAutomationStatus,
    getAutomationStatus,
  );
}

export function useAutomationError() {
  return useSyncExternalStore(
    subscribeAutomationConfig,
    getAutomationError,
    getAutomationError,
  );
}
