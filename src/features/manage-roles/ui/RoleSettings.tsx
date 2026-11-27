import { useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  ROLE_ADMIN_ID,
  createEmployeeRole,
  normalizeRole,
  removeRole,
  upsertRole,
  useAccessStatus,
  useRoles,
  type Role,
} from "@/entities/access";
import { useEntityConfig } from "@/entities/entity";
import { backfillRoleAccessMatrices } from "../lib/backfill-role-access";
import { RoleEditor } from "./RoleEditor";

type ViewState =
  { mode: "list" } | { mode: "edit"; draft: Role; isNew: boolean };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success" }
  | { status: "error"; message: string };

export function RoleSettings({ leading }: { leading?: ReactNode }) {
  const roles = useRoles();
  const status = useAccessStatus();
  const { entities } = useEntityConfig();
  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);
  const savingRef = useRef(false);
  const editedDuringSaveRef = useRef(false);

  const openCreate = () => {
    const base = createEmployeeRole();
    const role: Role = {
      ...base,
      id: `role-${crypto.randomUUID()}`,
      name: "Новая роль",
      description: "",
      isSystem: false,
    };
    setSaveState({ status: "idle" });
    setView({ mode: "edit", draft: role, isNew: true });
  };

  const handleSave = async () => {
    if (
      view.mode !== "edit" ||
      savingRef.current ||
      saveState.status === "success"
    ) {
      return;
    }
    const draft = view.draft;
    savingRef.current = true;
    editedDuringSaveRef.current = false;
    setSaveState({ status: "saving" });
    try {
      const result = await upsertRole(
        normalizeRole(backfillRoleAccessMatrices(draft, entities)),
      );
      if (!result.ok) {
        setSaveState({ status: "error", message: result.message });
        return;
      }
      setSaveState(
        editedDuringSaveRef.current
          ? { status: "idle" }
          : { status: "success" },
      );
    } finally {
      savingRef.current = false;
    }
  };

  const saveLabel =
    saveState.status === "saving"
      ? "Сохранение…"
      : saveState.status === "success"
        ? "Сохранено"
        : saveState.status === "error"
          ? "Ошибка"
          : "Сохранить";

  if (view.mode === "edit") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className="sticky top-0 z-20 -mx-1 flex min-h-9 min-w-0 items-center bg-background px-1 pb-3">
            <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {leading}
            </div>
            <div className="relative z-10 flex shrink-0 flex-col items-end gap-1 bg-background pl-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saveState.status === "saving"}
                  onClick={() => setView({ mode: "list" })}
                >
                  {saveState.status === "success" ? "К списку" : "Отмена"}
                </Button>
                <Button
                  type="button"
                  loading={false}
                  disabled={saveState.status === "saving"}
                  variant={
                    saveState.status === "error" ? "destructive" : "default"
                  }
                  aria-live="polite"
                  onClick={() => void handleSave()}
                >
                  {saveLabel}
                </Button>
              </div>
              {saveState.status === "error" ? (
                <p
                  role="status"
                  className="max-w-xs text-right text-xs break-words text-destructive"
                >
                  {saveState.message}
                </p>
              ) : null}
            </div>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">
            {view.isNew ? "Новая роль" : view.draft.name}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto pb-8">
          <RoleEditor
            role={view.draft}
            onChange={(draft) => {
              if (savingRef.current) editedDuringSaveRef.current = true;
              setSaveState((prev) =>
                prev.status === "saving" ? prev : { status: "idle" },
              );
              setView((prev) =>
                prev.mode === "edit" ? { ...prev, draft } : prev,
              );
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="sticky top-0 z-20 -mx-1 flex min-h-9 min-w-0 items-center bg-background px-1 pb-3">
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {leading}
        </div>
        <div className="relative z-10 shrink-0 bg-background pl-2">
          <Button
            type="button"
            size="icon"
            aria-label="Добавить роль"
            onClick={openCreate}
          >
            <Plus />
          </Button>
        </div>
      </div>

      {status === "idle" || status === "loading" ? (
        <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/30" />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {roles.map((role) => {
            const locked = role.id === ROLE_ADMIN_ID;
            return (
              <li
                key={role.id}
                className="group/role flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Shield className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {role.name}
                    {role.isSystem ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        системная
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {role.description || "Без описания"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Настроить роль"
                    onClick={() => {
                      // Always open a fresh clone from the store so the card
                      // name matches the list (no stale draft / option drift).
                      const fresh =
                        roles.find((item) => item.id === role.id) ?? role;
                      setSaveState({ status: "idle" });
                      setView({
                        mode: "edit",
                        draft: structuredClone(fresh),
                        isNew: false,
                      });
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="hover:text-destructive"
                    aria-label="Удалить роль"
                    disabled={locked || role.isSystem}
                    onClick={() => setPendingDelete(role)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Удалить роль?"
        description={`Роль «${pendingDelete?.name ?? ""}» будет удалена. Пользователям с этой ролью нужно назначить другую.`}
        confirmLabel="Удалить"
        onConfirm={() => {
          if (pendingDelete) void removeRole(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
