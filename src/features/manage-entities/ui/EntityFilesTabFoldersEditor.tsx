import { useState } from "react";
import { Check, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DEFAULT_ENTITY_FOLDER_COLOR,
  DEFAULT_ENTITY_LIST_COLORS,
  normalizeListColor,
  updateEntityTab,
  type Entity,
  type EntityTab,
  type EntityTabDefaultFolder,
} from "@/entities/entity";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { cn } from "@/shared/lib/cn";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; folder: EntityTabDefaultFolder };

function FolderColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const color = normalizeListColor(value);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DEFAULT_ENTITY_LIST_COLORS.map((swatch) => {
        const selected = color === swatch;
        return (
          <button
            key={swatch}
            type="button"
            title={swatch}
            aria-label={`Цвет ${swatch}`}
            aria-pressed={selected}
            onClick={() => onChange(swatch)}
            className={cn(
              "relative size-5 shrink-0 rounded-full border border-black/10 shadow-xs transition-transform hover:scale-110",
              selected && "outline-2 outline-offset-1 outline-ring",
            )}
            style={{ backgroundColor: swatch }}
          >
            {selected ? (
              <Check
                className="absolute inset-0 m-auto size-2.5 text-white drop-shadow"
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function FolderEditor({
  initial,
  existingNames,
  onCancel,
  onSubmit,
}: {
  initial?: EntityTabDefaultFolder | null;
  existingNames: string[];
  onCancel: () => void;
  onSubmit: (data: { name: string; color: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(
    normalizeListColor(initial?.color ?? DEFAULT_ENTITY_FOLDER_COLOR),
  );
  const trimmed = name.trim();
  const duplicate = existingNames.some(
    (item) =>
      item.toLowerCase() === trimmed.toLowerCase() &&
      item.toLowerCase() !== (initial?.name ?? "").toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;

  function submit() {
    if (!canSubmit) return;
    onSubmit({ name: trimmed, color });
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-5 flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70"
            style={{
              backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
              color,
            }}
            aria-hidden
          >
            <Folder className="size-4 stroke-[1.5]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="files-tab-folder-name">Название</Label>
            <Input
              id="files-tab-folder-name"
              value={name}
              placeholder="Например, Договоры"
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  event.preventDefault();
                  submit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  onCancel();
                }
              }}
            />
            {duplicate ? (
              <p className="text-xs text-destructive">
                Папка с таким названием уже есть
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Цвет</Label>
          <FolderColorSwatches value={color} onChange={setColor} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}

type EntityFilesTabFoldersEditorProps = {
  entity: Entity;
  tab: EntityTab;
  readOnly?: boolean;
};

export function EntityFilesTabFoldersEditor({
  entity,
  tab,
  readOnly = false,
}: EntityFilesTabFoldersEditorProps) {
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const folders = tab.defaultFolders;

  function persist(next: EntityTabDefaultFolder[]) {
    updateEntityTab(entity.id, tab.id, { defaultFolders: next });
  }

  function closeEditor() {
    setEditor({ mode: "closed" });
  }

  function handleCreate(data: { name: string; color: string }) {
    persist([
      ...folders,
      {
        id: crypto.randomUUID(),
        name: data.name,
        color: normalizeListColor(data.color),
      },
    ]);
    closeEditor();
  }

  function handleEdit(folderId: string, data: { name: string; color: string }) {
    persist(
      folders.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              name: data.name,
              color: normalizeListColor(data.color),
            }
          : folder,
      ),
    );
    closeEditor();
  }

  function handleDelete(folderId: string) {
    persist(folders.filter((folder) => folder.id !== folderId));
    if (editor.mode === "edit" && editor.folder.id === folderId) {
      closeEditor();
    }
  }

  const namesForCreate = folders.map((folder) => folder.name);
  const namesForEdit =
    editor.mode === "edit"
      ? folders
          .filter((folder) => folder.id !== editor.folder.id)
          .map((folder) => folder.name)
      : namesForCreate;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Folder className="size-4 stroke-[1.5]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-medium tracking-tight text-foreground">
                Папки по умолчанию
              </h3>
              <p className="text-xs text-muted-foreground">
                Создаются в корне файловой системы каждой новой записи
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {folders.length === 0 && editor.mode === "closed" ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/15 px-4 py-8 text-center">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">
                  Пока нет папок
                </p>
                <p className="text-xs text-muted-foreground">
                  {readOnly
                    ? "Для этой сущности структура папок не задана"
                    : "Добавьте структуру — например, «Договоры», «ТКП», «Акты»"}
                </p>
              </div>
              {!readOnly ? (
                <Button
                  type="button"
                  onClick={() => setEditor({ mode: "create" })}
                >
                  <Plus />
                  Добавить папку
                </Button>
              ) : null}
            </div>
          ) : null}

          {folders.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {folders.map((folder) => {
                const color = normalizeListColor(folder.color);
                if (editor.mode === "edit" && editor.folder.id === folder.id) {
                  return (
                    <li key={folder.id}>
                      <FolderEditor
                        initial={folder}
                        existingNames={namesForEdit}
                        onCancel={closeEditor}
                        onSubmit={(data) => handleEdit(folder.id, data)}
                      />
                    </li>
                  );
                }
                return (
                  <li
                    key={folder.id}
                    className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5"
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
                        color,
                      }}
                      aria-hidden
                    >
                      <Folder className="size-3.5 stroke-[1.5]" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">
                      {folder.name}
                    </span>
                    {!readOnly ? (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Изменить «${folder.name}»`}
                          disabled={editor.mode !== "closed"}
                          onClick={() => setEditor({ mode: "edit", folder })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Удалить «${folder.name}»`}
                          disabled={editor.mode !== "closed"}
                          onClick={() => handleDelete(folder.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {!readOnly && editor.mode === "create" ? (
            <FolderEditor
              existingNames={namesForCreate}
              onCancel={closeEditor}
              onSubmit={handleCreate}
            />
          ) : null}

          {!readOnly && folders.length > 0 && editor.mode === "closed" ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setEditor({ mode: "create" })}
            >
              <Plus />
              Добавить папку
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
