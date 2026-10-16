import { useState, type ReactNode } from "react";
import { Copy, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  ROLE_ADMIN_ID,
  cloneRole,
  createEmployeeRole,
  normalizeRole,
  removeRole,
  upsertRole,
  useAccessStatus,
  useRoles,
  type Role,
} from "@/entities/access";
import { RoleEditor } from "./RoleEditor";

type ViewState =
  { mode: "list" } | { mode: "edit"; draft: Role; isNew: boolean };

export function RoleSettings({ leading }: { leading?: ReactNode }) {
  const roles = useRoles();
  const status = useAccessStatus();
  const [view, setView] = useState<ViewState>({ mode: "list" });
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  const openCreate = () => {
    const base = createEmployeeRole();
    const role: Role = {
      ...base,
      id: `role-${crypto.randomUUID()}`,
      name: "Новая роль",
      description: "",
      isSystem: false,
    };
    setView({ mode: "edit", draft: role, isNew: true });
  };

  const handleSave = () => {
    if (view.mode !== "edit") return;
    upsertRole(normalizeRole(view.draft));
    setView({ mode: "list" });
  };

  if (view.mode === "edit") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {leading}
            <h2 className="mt-3 text-lg font-semibold tracking-tight">
              {view.isNew ? "Новая роль" : view.draft.name}
            </h2>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setView({ mode: "list" })}
            >
              Отмена
            </Button>
            <Button type="button" onClick={handleSave}>
              Сохранить
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto pb-8">
          <RoleEditor
            role={view.draft}
            onChange={(draft) => setView({ ...view, draft })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">{leading}</div>
        <Button
          type="button"
          size="icon"
          aria-label="Добавить роль"
          onClick={openCreate}
        >
          <Plus />
        </Button>
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
                    aria-label="Клонировать роль"
                    onClick={() => {
                      const cloned = cloneRole(role.id);
                      if (cloned) {
                        setView({
                          mode: "edit",
                          draft: structuredClone(cloned),
                          isNew: false,
                        });
                      }
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Настроить роль"
                    onClick={() =>
                      setView({
                        mode: "edit",
                        draft: structuredClone(role),
                        isNew: false,
                      })
                    }
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
          if (pendingDelete) removeRole(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
