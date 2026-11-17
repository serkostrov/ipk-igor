import { toast } from "sonner";
import { formatErrorDetail } from "./error-message";

/**
 * Error toast with title and an optional collapsible
 * «Подробнее» section holding the raw technical error for support/debugging.
 */
export function notifyError(title: string, error?: unknown): void {
  const detail = error === undefined ? null : formatErrorDetail(error);
  toast.error(title, {
    duration: 8000,
    description: detail ? (
      <details className="mt-1">
        <summary className="cursor-pointer select-none text-xs opacity-70 transition-opacity hover:opacity-100">
          Подробнее
        </summary>
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-[11px] leading-snug">
          {detail}
        </pre>
      </details>
    ) : undefined,
  });
}
