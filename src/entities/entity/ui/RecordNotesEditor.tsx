import { useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Link2,
  Paperclip,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/cn";
import { formatTimestampDisplay } from "@/shared/lib/format-date";
import { getPersonInitials } from "@/shared/lib/person";
import {
  deleteEntityFileObject,
  uploadEntityNoteAttachment,
} from "../api/entity-files-api";
import { notifyRecordMentions } from "../lib/notify-record-mentions";
import { getEntityUrlHref } from "../model/field";
import { getSystemUserName } from "../model/system-entities";
import {
  formatEntityFileSize,
  getEntityTabRecordsValueKey,
  parseEntityTabRecordEntries,
  serializeEntityTabRecordEntries,
  type Entity,
  type EntityRecord,
  type EntityTab,
  type EntityTabRecordAttachment,
  type EntityTabRecordEntry,
  type EntityTabRecordLink,
} from "../model/types";
import { useCurrentUserRecordId, useEntityConfig } from "../hooks/use-entity";
import { updateEntityRecord } from "../store/entity-store";
import { EntityFileThumb } from "./EntityFileThumb";
import { EntityFileViewer } from "./EntityFileViewer";
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

type PendingFile = {
  id: string;
  file: File;
};

type NoteDraftPayload = {
  text: string;
  attachments: EntityTabRecordAttachment[];
  links: EntityTabRecordLink[];
};

function noteHasContent(payload: NoteDraftPayload) {
  return (
    payload.text.trim().length > 0 ||
    payload.attachments.length > 0 ||
    payload.links.length > 0
  );
}

async function uploadPendingFiles(options: {
  entityId: string;
  recordId: string;
  tabId: string;
  noteId: string;
  pending: readonly PendingFile[];
}): Promise<EntityTabRecordAttachment[]> {
  const uploaded: EntityTabRecordAttachment[] = [];
  for (const item of options.pending) {
    const result = await uploadEntityNoteAttachment({
      entityId: options.entityId,
      recordId: options.recordId,
      tabId: options.tabId,
      noteId: options.noteId,
      entryId: item.id,
      file: item.file,
    });
    uploaded.push({
      id: item.id,
      name: item.file.name,
      mimeType: item.file.type || undefined,
      size: item.file.size,
      storagePath: result.storagePath,
      dataUrl: result.dataUrl,
    });
  }
  return uploaded;
}

async function deleteAttachmentObjects(
  attachments: readonly EntityTabRecordAttachment[],
) {
  await Promise.all(
    attachments
      .map((item) => item.storagePath?.trim())
      .filter((path): path is string => Boolean(path))
      .map((path) => deleteEntityFileObject(path)),
  );
}

function NoteLinkChip({
  link,
  onRemove,
}: {
  link: EntityTabRecordLink;
  onRemove?: () => void;
}) {
  const href = getEntityUrlHref(link.url);
  const label = link.title?.trim() || link.url;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 py-1 text-xs">
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate font-medium text-primary underline-offset-2 hover:underline"
          title={link.url}
        >
          {label}
        </a>
      ) : (
        <span className="min-w-0 truncate text-foreground" title={link.url}>
          {label}
        </span>
      )}
      {onRemove ? (
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Убрать ссылку"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

function NoteAttachmentChip({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: EntityTabRecordAttachment;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background px-1.5 py-1 text-xs">
      <button
        type="button"
        className="inline-flex min-w-0 items-center gap-1.5 text-left"
        onClick={onOpen}
        title={attachment.name}
      >
        <EntityFileThumb
          name={attachment.name}
          mimeType={attachment.mimeType}
          storagePath={attachment.storagePath}
          dataUrl={attachment.dataUrl}
          className="size-6"
          iconSizeClassName="size-3.5"
        />
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground">
            {attachment.name}
          </span>
          {attachment.size != null ? (
            <span className="block truncate text-[10px] text-muted-foreground">
              {formatEntityFileSize(attachment.size)}
            </span>
          ) : null}
        </span>
      </button>
      {onRemove ? (
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          aria-label="Убрать файл"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

function NoteLinkComposer({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (link: EntityTabRecordLink) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const canAdd = Boolean(getEntityUrlHref(url));

  function reset() {
    setUrl("");
    setTitle("");
  }

  function submit() {
    const href = getEntityUrlHref(url);
    if (!href) return;
    onAdd({
      id: crypto.randomUUID(),
      url: url.trim(),
      title: title.trim() || null,
    });
    reset();
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 text-muted-foreground"
            disabled={disabled}
            aria-label="Добавить ссылку"
            title="Добавить ссылку"
          />
        }
      >
        <Link2 className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-link-url">Ссылка</Label>
          <Input
            id="note-link-url"
            type="url"
            value={url}
            placeholder="https://…"
            autoFocus
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="note-link-title">Подпись</Label>
          <Input
            id="note-link-title"
            value={title}
            placeholder="Необязательно"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={!canAdd} onClick={submit}>
            Добавить
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NoteAttachmentsBar({
  attachments,
  links,
  pending,
  onOpenAttachment,
  onRemoveAttachment,
  onRemovePending,
  onRemoveLink,
}: {
  attachments: readonly EntityTabRecordAttachment[];
  links: readonly EntityTabRecordLink[];
  pending?: readonly PendingFile[];
  onOpenAttachment?: (id: string) => void;
  onRemoveAttachment?: (id: string) => void;
  onRemovePending?: (id: string) => void;
  onRemoveLink?: (id: string) => void;
}) {
  if (
    attachments.length === 0 &&
    links.length === 0 &&
    (pending?.length ?? 0) === 0
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((item) => (
        <NoteAttachmentChip
          key={item.id}
          attachment={item}
          onOpen={
            onOpenAttachment ? () => onOpenAttachment(item.id) : undefined
          }
          onRemove={
            onRemoveAttachment ? () => onRemoveAttachment(item.id) : undefined
          }
        />
      ))}
      {(pending ?? []).map((item) => (
        <NoteAttachmentChip
          key={item.id}
          attachment={{
            id: item.id,
            name: item.file.name,
            mimeType: item.file.type || undefined,
            size: item.file.size,
          }}
          onRemove={
            onRemovePending ? () => onRemovePending(item.id) : undefined
          }
        />
      ))}
      {links.map((link) => (
        <NoteLinkChip
          key={link.id}
          link={link}
          onRemove={onRemoveLink ? () => onRemoveLink(link.id) : undefined}
        />
      ))}
    </div>
  );
}

function NoteItem({
  entry,
  authorName,
  entities,
  entityId,
  recordId,
  tabId,
  onSave,
  onRemove,
}: {
  entry: EntityTabRecordEntry;
  authorName: string | null;
  entities: Entity[];
  entityId: string;
  recordId: string;
  tabId: string;
  onSave: (payload: NoteDraftPayload) => Promise<void>;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [attachments, setAttachments] = useState(entry.attachments);
  const [links, setLinks] = useState(entry.links);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const draft = { text, attachments, links };
  const canSave = noteHasContent(draft) && !busy;

  function cancel() {
    setText(entry.text);
    setAttachments(entry.attachments);
    setLinks(entry.links);
    setPending([]);
    setRemovedPaths([]);
    setEditing(false);
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      const uploaded = await uploadPendingFiles({
        entityId,
        recordId,
        tabId,
        noteId: entry.id,
        pending,
      });
      await deleteAttachmentObjects(
        removedPaths.map((storagePath) => ({
          id: storagePath,
          name: storagePath,
          storagePath,
        })),
      );
      await onSave({
        text: text.trim(),
        attachments: [...attachments, ...uploaded],
        links,
      });
      setPending([]);
      setRemovedPaths([]);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function removeAttachment(id: string) {
    const target = attachments.find((item) => item.id === id);
    if (target?.storagePath?.trim()) {
      setRemovedPaths((current) => [...current, target.storagePath!.trim()]);
    }
    setAttachments((current) => current.filter((item) => item.id !== id));
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
                  onClick={() => {
                    setText(entry.text);
                    setAttachments(entry.attachments);
                    setLinks(entry.links);
                    setPending([]);
                    setRemovedPaths([]);
                    setEditing(true);
                  }}
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
                disabled={busy}
                onChange={setText}
                onKeyDown={(event) => {
                  if (event.key === "Escape") cancel();
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault();
                    void save();
                  }
                }}
              />
              <NoteAttachmentsBar
                attachments={attachments}
                links={links}
                pending={pending}
                onRemoveAttachment={removeAttachment}
                onRemovePending={(id) =>
                  setPending((current) =>
                    current.filter((item) => item.id !== id),
                  )
                }
                onRemoveLink={(id) =>
                  setLinks((current) =>
                    current.filter((item) => item.id !== id),
                  )
                }
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-8 text-muted-foreground"
                    disabled={busy}
                    aria-label="Прикрепить файл"
                    title="Прикрепить файл"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-4" />
                  </Button>
                  <NoteLinkComposer
                    disabled={busy}
                    onAdd={(link) => setLinks((current) => [...current, link])}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={cancel}
                  >
                    Отмена
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canSave}
                    onClick={() => void save()}
                  >
                    Сохранить
                  </Button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length === 0) return;
                  setPending((current) => [
                    ...current,
                    ...files.map((file) => ({
                      id: crypto.randomUUID(),
                      file,
                    })),
                  ]);
                }}
              />
            </div>
          ) : (
            <div className="mt-0.5 flex flex-col gap-2">
              {entry.text ? (
                <RecordMentionText
                  text={entry.text}
                  entities={entities}
                  className="text-sm leading-relaxed text-foreground"
                />
              ) : null}
              <NoteAttachmentsBar
                attachments={entry.attachments}
                links={entry.links}
                onOpenAttachment={setViewerId}
              />
            </div>
          )}
        </div>
      </div>

      <EntityFileViewer
        open={viewerId != null}
        onOpenChange={(open) => {
          if (!open) setViewerId(null);
        }}
        files={entry.attachments}
        activeId={viewerId}
        onActiveIdChange={setViewerId}
      />
    </li>
  );
}

/**
 * Shared notes list + composer for entity records tabs and automation tasks.
 * Supports file attachments, explicit links, `@имя` mentions and auto-URLs.
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(
    () => parseEntityTabRecordEntries(record.values[valueKey]),
    [record.values, valueKey],
  );
  const shown = limit != null ? entries.slice(0, limit) : entries;
  const rest = limit != null ? Math.max(0, entries.length - shown.length) : 0;
  const [draft, setDraft] = useState("");
  const [links, setLinks] = useState<EntityTabRecordLink[]>([]);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave =
    !busy &&
    (draft.trim().length > 0 || links.length > 0 || pending.length > 0);

  async function persist(
    next: EntityTabRecordEntry[],
    mention?: { text: string; previousText?: string },
  ) {
    setBusy(true);
    setError(null);
    try {
      await updateEntityRecord(entity.id, record.id, {
        ...record.values,
        [valueKey]: serializeEntityTabRecordEntries(next),
      });
      if (mention?.text.trim()) {
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
    if (!text && links.length === 0 && pending.length === 0) return;
    const noteId = crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const attachments = await uploadPendingFiles({
        entityId: entity.id,
        recordId: record.id,
        tabId: tab.id,
        noteId,
        pending,
      });
      const entry: EntityTabRecordEntry = {
        id: noteId,
        text,
        createdAt: new Date().toISOString(),
        authorId: currentUserRecordId,
        editedAt: null,
        attachments,
        links,
      };
      await updateEntityRecord(entity.id, record.id, {
        ...record.values,
        [valueKey]: serializeEntityTabRecordEntries([entry, ...entries]),
      });
      if (text) {
        await notifyRecordMentions({
          entities,
          entityId: entity.id,
          recordId: record.id,
          text,
          authorId: currentUserRecordId,
          entityName: entity.name,
        });
      }
      setDraft("");
      setLinks([]);
      setPending([]);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить запись",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(entryId: string, payload: NoteDraftPayload) {
    const previous = entries.find((item) => item.id === entryId);
    await persist(
      entries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              text: payload.text,
              attachments: payload.attachments,
              links: payload.links,
              editedAt: new Date().toISOString(),
            }
          : entry,
      ),
      {
        text: payload.text,
        previousText: previous?.text ?? "",
      },
    );
  }

  async function handleRemove(entryId: string) {
    const target = entries.find((entry) => entry.id === entryId);
    if (target) {
      void deleteAttachmentObjects(target.attachments);
    }
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
              entityId={entity.id}
              recordId={record.id}
              tabId={tab.id}
              authorName={getSystemUserName(entities, entry.authorId)}
              onSave={(payload) => handleEdit(entry.id, payload)}
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
          placeholder="Добавить запись… @имя · файлы · ссылки"
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
        <NoteAttachmentsBar
          attachments={[]}
          links={links}
          pending={pending}
          onRemovePending={(id) =>
            setPending((current) => current.filter((item) => item.id !== id))
          }
          onRemoveLink={(id) =>
            setLinks((current) => current.filter((item) => item.id !== id))
          }
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground"
              disabled={busy}
              aria-label="Прикрепить файл"
              title="Прикрепить файл"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
            <NoteLinkComposer
              disabled={busy}
              onAdd={(link) => setLinks((current) => [...current, link])}
            />
            <p className="truncate text-xs text-muted-foreground">
              ⌘/Ctrl + Enter
            </p>
          </div>
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
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length === 0) return;
            setPending((current) => [
              ...current,
              ...files.map((file) => ({
                id: crypto.randomUUID(),
                file,
              })),
            ]);
          }}
        />
      </div>
    </div>
  );
}
