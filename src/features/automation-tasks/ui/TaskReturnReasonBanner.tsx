import type { AutomationTaskHighlightNote } from "@/entities/automation";

export function TaskReturnReasonBanner({
  note,
}: {
  note: AutomationTaskHighlightNote;
}) {
  if (note.kind !== "return_reason" || !note.text.trim()) return null;

  return (
    <aside
      className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3.5 py-3 text-amber-950 dark:text-amber-100"
      aria-label={note.title}
    >
      <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-200/90">
        {note.title}
      </p>
      {note.fieldLabel.trim() ? (
        <p className="mt-0.5 text-[11px] text-amber-900/65 dark:text-amber-100/60">
          {note.fieldLabel}
        </p>
      ) : null}
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
        {note.text.trim()}
      </p>
    </aside>
  );
}
