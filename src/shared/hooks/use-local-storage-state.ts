import { useCallback, useState } from "react";

function readStoredValue<T>(key: string, parse: (value: unknown) => T | null) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? null : parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: unknown) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is unavailable (private mode, quota) — keep in-memory state.
  }
}

/** State persisted per `key`; re-reads storage when the key changes. */
export function useLocalStorageState<T>(
  key: string,
  parse: (value: unknown) => T | null,
  fallback: T,
) {
  const [entry, setEntry] = useState(() => ({
    key,
    value: readStoredValue(key, parse) ?? fallback,
  }));

  let current = entry;
  if (entry.key !== key) {
    current = { key, value: readStoredValue(key, parse) ?? fallback };
    setEntry(current);
  }

  const setValue = useCallback(
    (value: T) => {
      setEntry({ key, value });
      writeStoredValue(key, value);
    },
    [key],
  );

  return [current.value, setValue] as const;
}
