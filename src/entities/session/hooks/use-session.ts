import { useSyncExternalStore } from "react";
import {
  getSession,
  getSessionError,
  getSessionStatus,
  getSessionUser,
  subscribeSession,
} from "../store/session-store";

export function useSessionStatus() {
  return useSyncExternalStore(
    subscribeSession,
    getSessionStatus,
    getSessionStatus,
  );
}

export function useSessionError() {
  return useSyncExternalStore(
    subscribeSession,
    getSessionError,
    getSessionError,
  );
}

export function useSession() {
  return useSyncExternalStore(subscribeSession, getSession, getSession);
}

export function useSessionUser() {
  return useSyncExternalStore(subscribeSession, getSessionUser, getSessionUser);
}
