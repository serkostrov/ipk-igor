import { useCallback, type ReactNode } from "react";
import { useAsyncValue } from "@/shared/hooks/use-async-value";
import { Loader } from "@/shared/ui/loader";

type Props<T> = {
  promise: Promise<T>;
  children: (value: T) => ReactNode;
};

/**
 * Renders the resolved value of `promise`.
 *
 * Built on `useAsyncValue` (not React `use()` + Suspense): a promise that the
 * owner re-creates on churn would make `use()` spin in a synchronous retry loop
 * and freeze the tab. The hook instead keeps the last resolved value while a new
 * promise is pending, so churn degrades gracefully instead of hanging.
 */
export function AsyncValue<T>({ promise, children }: Props<T>) {
  const state = useAsyncValue(useCallback(() => promise, [promise]));
  if (state.status === "error") throw state.error;
  if (state.status === "loading") {
    return <Loader block label="Загрузка…" />;
  }
  return <>{children(state.value)}</>;
}
