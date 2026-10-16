import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  getEntityTabRecordsValueKey,
  getSystemUserName,
  parseEntityTabRecordEntries,
  serializeEntityTabRecordEntries,
  updateEntityRecord,
  useCurrentUserRecordId,
  useEntityConfig,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityTabRecordEntry,
} from "@/entities/entity";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { cn } from "@/shared/lib/cn";
import { getPersonInitials } from "@/shared/lib/person";

type RecordNotesTabPanelProps = {
  entity: Entity;
  record: EntityRecord;
  tab: EntityTab;
};

function NoteItem({
  entry,
  authorName,
  onSave,
  onRemove,
}: {
  entry: EntityTabRecordEntry;
  authorName: string | null;
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
                  aria-label="Изменить комментарий"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Удалить комментарий"
                  onClick={onRemove}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
          {editing ? (
            <div className="mt-1.5 flex flex-col gap-2">
              <Textarea
                value={text}
                autoFocus
                className="min-h-20 resize-y bg-background"
                onChange={(event) => setText(event.target.value)}
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
            <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {entry.text}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function RecordNotesTabPanel({
  entity,
  record,
  tab,
}: RecordNotesTabPanelProps) {
  const { entities } = useEntityConfig();
  const currentUserRecordId = useCurrentUserRecordId();
  const valueKey = getEntityTabRecordsValueKey(tab.id);
  const entries = useMemo(
    () => parseEntityTabRecordEntries(record.values[valueKey]),
    [record.values, valueKey],
  );
  const [draft, setDraft] = useState("");
  const canSave = draft.trim().length > 0;

  function persist(next: EntityTabRecordEntry[]) {
    updateEntityRecord(entity.id, record.id, {
      ...record.values,
      [valueKey]: serializeEntityTabRecordEntries(next),
    });
  }

  function handleSave() {
    const text = draft.trim();
    if (!text) return;
    const entry: EntityTabRecordEntry = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
      authorId: currentUserRecordId,
      editedAt: null,
    };
    persist([entry, ...entries]);
    setDraft("");
  }

  function handleEdit(entryId: string, text: string) {
    persist(
      entries.map((entry) =>
        entry.id === entryId
          ? { ...entry, text, editedAt: new Date().toISOString() }
          : entry,
      ),
    );
  }

  function handleRemove(entryId: string) {
    persist(entries.filter((entry) => entry.id !== entryId));
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {tab.name}
        </h2>
        <span className="text-sm text-muted-foreground">
          {entries.length > 0
            ? `${entries.length} ${entries.length === 1 ? "запись" : entries.length < 5 ? "записи" : "записей"}`
            : null}
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Записей пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <NoteItem
                key={entry.id}
                entry={entry}
                authorName={getSystemUserName(entities, entry.authorId)}
                onSave={(text) => handleEdit(entry.id, text)}
                onRemove={() => handleRemove(entry.id)}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2.5 border-t border-border/70 pt-4">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Добавить запись…"
            className="min-h-24 resize-y"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                handleSave();
              }
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">⌘/Ctrl + Enter</p>
            <Button
              type="button"
              disabled={!canSave}
              className={cn(!canSave && "opacity-60")}
              onClick={handleSave}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
