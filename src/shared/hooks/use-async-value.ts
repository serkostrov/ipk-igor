import { useEffect, useState, type DependencyList } from "react";

type Result<T> =
  { status: "ready"; value: T } | { status: "error"; error: unknown };

/** Stable loading sentinel — a fresh object each render would churn consumers. */
const LOADING = { status: "loading" } as const;

/** Structural equality for the common async result shapes (records, maps, arrays). */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k) || !deepEqual(v, b.get(k))) return false;
    }
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr && bArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (
      !deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Read the result of a memoized async computation, re-running when `deps` change.
 *
 * `deps` are an effect-style dependency array: the read re-runs only when they
 * change, so `read` can be a fresh inline closure every render without needing
 * `useCallback`. `react-hooks/exhaustive-deps` is configured with
 * `additionalHooks: "useAsyncValue"`, so the deps array is lint-checked like an
 * effect's.
 *
 * The resolved value is compared structurally against the last one, so a read
 * that re-computes the *same* data never triggers a re-render. This is the guard
 * against the store-write feedback loop: a resolve that would (directly or via a
 * dependent effect) write the store and change `deps` must not re-fire the read
 * for unchanged data, or the tab freezes. The previous value is also kept while
 * a new read is in flight (no flash to empty on reload).
 */
export function useAsyncValue<T>(read: () => Promise<T>, deps: DependencyList) {
  const [completed, setCompleted] = useState<Result<T>>();

  useEffect(() => {
    let active = true;
    void read().then(
      (value) => {
        if (!active) return;
        // Returning the previous state reference makes React bail out of the
        // re-render, so a read that re-computes the same data can't loop.
        setCompleted((prev) =>
          prev && prev.status === "ready" && deepEqual(prev.value, value)
            ? prev
            : { status: "ready", value },
        );
      },
      (error: unknown) => {
        if (!active) return;
        setCompleted((prev) =>
          prev && prev.status === "error" ? prev : { status: "error", error },
        );
      },
    );
    return () => {
      active = false;
    };
    // `deps` is the caller's dependency array (validated via additionalHooks).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return completed ?? LOADING;
}
