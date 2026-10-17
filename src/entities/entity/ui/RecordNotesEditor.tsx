import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { getPersonInitials } from "@/shared/lib/person";
import { notifyRecordMentions } from "../lib/notify-record-mentions";
import { getSystemUserName } from "../model/system-entities";
import {
  getEntityTabRecordsValueKey,
  parseEntityTabRecordEntries,
  serializeEntityTabRecordEntries,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityTabRecordEntry,
} from "../model/types";
import { useCurrentUserRecordId, useEntityConfig } from "../hooks/use-entity";
import { updateEntityRecord } from "../store/entity-store";
import { RecordMentionText } from "./RecordMentionText";
import { RecordMentionTextarea } from "./RecordMentionTextarea";

type RecordNotesEditorProps = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
  /** Cap listed entries (task preview). */
  limit?: number;
  /** Compact chrome for embedding in task dialogs. */
  compact?: boolean;
  className?: string;
};

function NoteItem({
  entry,
  authorName,
  entities,
  onSave,
  onRemove,
}: {
  entry: EntityTabRecordEntry;
  authorName: string | null;
  entities: Entity[];
  onSave: (text: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const canSave = text.trim().length > 0;

  function cancel() {
    setText(entry.text);
    setEditing(false);
  }

  function save() {
    if (!canSave) return;
    onSave(text.trim());
    setEditing(false);
  }

  return (
    <li className="group/note rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold tracking-wide text-primary"
        >
          {authorName ? getPersonInitials(authorName) : "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-7 items-center justify-between gap-2">
            <p className="flex min-w-0 items-baseline gap-1.5 text-xs">
              <span className="truncate font-medium text-foreground">
                {authorName ?? "Без автора"}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatTimestampDisplay(entry.createdAt)}
                {entry.editedAt ? " · изменено" : ""}
              </span>
            </p>
            {editing ? null : (
              <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/note:opacity-100 focus-within:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label="Изменить запись"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Удалить запись"
                  onClick={onRemove}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
          {editing ? (
            <div className="mt-1.5 flex flex-col gap-2">
              <RecordMentionTextarea
                value={text}
                entities={entities}
                autoFocus
                className="min-h-20 resize-y bg-background"
                onChange={setText}
                onKeyDown={(event) => {
                  if (event.key === "Escape") cancel();
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    save();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cancel}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canSave}
                  onClick={save}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          ) : (
            <RecordMentionText
              text={entry.text}
              entities={entities}
              className="mt-0.5 text-sm leading-relaxed text-foreground"
            />
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Shared notes list + composer for entity records tabs and automation tasks.
 * Persists onto the entity record; `@имя` notifies mentioned users.
 */
export function RecordNotesEditor({
  entity,
  record,
  tab,
  limit,
  compact = false,
  className,
}: RecordNotesEditorProps) {
  const { entities } = useEntityConfig();
  const currentUserRecordId = useCurrentUserRecordId();
  const valueKey = getEntityTabRecordsValueKey(tab.id);
  const entries = useMemo(
    () => parseEntityTabRecordEntries(record.values[valueKey]),
    [record.values, valueKey],
  );
  const shown = limit != null ? entries.slice(0, limit) : entries;
  const rest = limit != null ? Math.max(0, entries.length - shown.length) : 0;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const canSave = draft.trim().length > 0 && !busy;

  async function persist(
    next: EntityTabRecordEntry[],
    mention?: { text: string; previousText?: string },
  ) {
    setBusy(true);
    try {
      await updateEntityRecord(entity.id, record.id, {
        ...record.values,
        [valueKey]: serializeEntityTabRecordEntries(next),
      });
      if (mention) {
        await notifyRecordMentions({
          entities,
          entityId: entity.id,
          recordId: record.id,
          text: mention.text,
          previousText: mention.previousText,
          authorId: currentUserRecordId,
          entityName: entity.name,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const text = draft.trim();
    if (!text) return;
    const entry: EntityTabRecordEntry = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      authorId: currentUserRecordId,
      editedAt: null,
    };
    await persist([entry, ...entries], { text });
    setDraft("");
  }

  async function handleEdit(entryId: string, text: string) {
    const previous = entries.find((item) => item.id === entryId)?.text ?? "";
    await persist(
      entries.map((entry) =>
        entry.id === entryId
          ? { ...entry, text, editedAt: new Date().toISOString() }
          : entry,
      ),
      { text, previousText: previous },
    );
  }

  async function handleRemove(entryId: string) {
    await persist(entries.filter((entry) => entry.id !== entryId));
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Записей пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((entry) => (
            <NoteItem
              key={entry.id}
              entry={entry}
              entities={entities}
              authorName={getSystemUserName(entities, entry.authorId)}
              onSave={(text) => void handleEdit(entry.id, text)}
              onRemove={() => void handleRemove(entry.id)}
            />
          ))}
          {rest > 0 ? (
            <li className="text-center text-[11px] text-muted-foreground">
              и ещё {rest}
            </li>
          ) : null}
        </ul>
      )}

      <div
        className={cn(
          "flex flex-col gap-2.5",
          !compact && "border-t border-border/70 pt-4",
          compact && "rounded-lg border border-border/70 bg-background p-3",
        )}
      >
        <RecordMentionTextarea
          value={draft}
          entities={entities}
          placeholder="Добавить запись… Напишите @имя, чтобы упомянуть"
          className={cn("resize-y", compact ? "min-h-20" : "min-h-24")}
          disabled={busy}
          onChange={setDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void handleSave();
            }
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">@имя · ⌘/Ctrl + Enter</p>
          <Button
            type="button"
            size={compact ? "sm" : "default"}
            disabled={!canSave}
            className={cn(!canSave && "opacity-60")}
            onClick={() => void handleSave()}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}
