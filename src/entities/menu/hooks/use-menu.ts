import { useSyncExternalStore } from "react";
import {
  getMenuConfig,
  getMenuError,
  getMenuStatus,
  subscribeMenuConfig,
} from "../store/menu-store";

export function useMenuConfig() {
  return useSyncExternalStore(
    subscribeMenuConfig,
    getMenuConfig,
    getMenuConfig,
  );
}

export function useMenuStatus() {
  return useSyncExternalStore(
    subscribeMenuConfig,
    getMenuStatus,
    getMenuStatus,
  );
}

export function useMenuError() {
  return useSyncExternalStore(subscribeMenuConfig, getMenuError, getMenuError);
}
