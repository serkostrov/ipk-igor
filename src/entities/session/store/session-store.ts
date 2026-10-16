import {
  getSessionSnapshot,
  subscribeAuth,
  type SessionSnapshot,
} from "../api/session-api";

export type SessionStatus = "idle" | "loading" | "ready" | "error";

type Listener = () => void;

let status: SessionStatus = "loading";
let errorMessage: string | null = null;
let snapshot: SessionSnapshot = { session: null, user: null };
let initPromise: Promise<void> | null = null;
let unsubscribeAuth: (() => void) | null = null;

const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: SessionSnapshot) {
  snapshot = next;
  status = "ready";
  errorMessage = null;
  notify();
}

export function getSessionStatus() {
  return status;
}

export function getSessionError() {
  return errorMessage;
}

export function getSession() {
  return snapshot.session;
}

export function getSessionUser() {
  return snapshot.user;
}

export function subscribeSession(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function initSession() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    status = "loading";
    errorMessage = null;
    notify();

    try {
      if (!unsubscribeAuth) {
        unsubscribeAuth = subscribeAuth((next) => {
          setSnapshot(next);
        });
      }
      const next = await getSessionSnapshot();
      setSnapshot(next);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Не удалось проверить сессию";
      console.error("[session] init failed", error);
      status = "error";
      errorMessage = message;
      snapshot = { session: null, user: null };
      notify();
    }
  })();

  return initPromise;
}
