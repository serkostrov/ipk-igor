import { useSyncExternalStore } from "react";
import {
  getNotificationConfig,
  getNotificationError,
  getNotificationInbox,
  getNotificationInboxStatus,
  getNotificationStatus,
  getUnreadNotificationCount,
  subscribeNotificationStore,
} from "../store/notification-store";

export function useNotificationConfig() {
  return useSyncExternalStore(
    subscribeNotificationStore,
    getNotificationConfig,
    getNotificationConfig,
  );
}

export function useNotificationStatus() {
  return useSyncExternalStore(
    subscribeNotificationStore,
    getNotificationStatus,
    getNotificationStatus,
  );
}

export function useNotificationError() {
  return useSyncExternalStore(
    subscribeNotificationStore,
    getNotificationError,
    getNotificationError,
  );
}

export function useNotificationInbox() {
  return useSyncExternalStore(
    subscribeNotificationStore,
    getNotificationInbox,
    getNotificationInbox,
  );
}

export function useNotificationInboxStatus() {
  return useSyncExternalStore(
    subscribeNotificationStore,
    getNotificationInboxStatus,
    getNotificationInboxStatus,
  );
}

export function useUnreadNotificationCount() {
  return useSyncExternalStore(
    subscribeNotificationStore,
    getUnreadNotificationCount,
    getUnreadNotificationCount,
  );
}
