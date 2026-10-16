import { useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import {
  createDefaultNotificationRule,
  describeNotificationTrigger,
  removeNotificationRule,
  saveNotificationRule,
  sendNotification,
  useNotificationConfig,
  useNotificationStatus,
  type NotificationRule,
} from "@/entities/notification";
import { findSystemUserByAuthId, useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/cn";
import { NotificationRuleEditor } from "./NotificationRuleEditor";

export function NotificationSettings({ leading }: { leading?: ReactNode }) {
  const { rules } = useNotificationConfig();
  const status = useNotificationStatus();
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected =
    rules.find((rule) => rule.id === selectedId) ?? rules[0] ?? null;

  const entityNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entity of entities) {
      map.set(entity.id, entity.namePlural || entity.name);
    }
    return map;
  }, [entities]);

  async function handleAdd() {
    const entityId = entities[0]?.id;
    if (!entityId) return;
    const rule = createDefaultNotificationRule(entityId);
    setBusy(true);
    try {
      await saveNotificationRule(rule);
      setSelectedId(rule.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(rule: NotificationRule) {
    setBusy(true);
    try {
      await saveNotificationRule(rule);
      setSelectedId(rule.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(ruleId: string) {
    setBusy(true);
    try {
      await removeNotificationRule(ruleId);
      setSelectedId(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleTest(rule: NotificationRule) {
    if (!sessionUser) return;
    const userRecord = findSystemUserByAuthId(entities, sessionUser.id);
    const userId = userRecord?.id ?? sessionUser.id;
    await sendNotification({
      userId,
      title: rule.titleTemplate || rule.name || "Тест уведомления",
      message:
        rule.messageTemplate ||
        `Тестовое уведомление: ${rule.name || "без названия"}`,
      source: "action",
      ruleId: rule.id,
      entityId: rule.entityId,
      showToast: rule.showToast,
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {leading}
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card lg:w-80">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div>
              <p className="text-sm font-semibold">Правила</p>
              <p className="text-[11px] text-muted-foreground">
                Когда и кому слать уведомления
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || entities.length === 0}
              onClick={() => void handleAdd()}
            >
              <Plus className="size-3.5" />
              Правило
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {status === "loading" ? (
              <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
            ) : rules.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                Пока нет правил. Создайте первое.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rules.map((rule) => {
                  const active = selected?.id === rule.id;
                  return (
                    <li key={rule.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(rule.id)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/60",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {rule.name}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {entityNameById.get(rule.entityId) ?? "—"} ·{" "}
                            {describeNotificationTrigger(rule)}
                          </p>
                        </div>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(enabled) => {
                            void handleSave({ ...rule, enabled });
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {selected ? (
            <NotificationRuleEditor
              key={selected.id}
              rule={selected}
              entities={entities}
              onSave={(rule) => void handleSave(rule)}
              onDelete={() => void handleDelete(selected.id)}
              onTest={(rule) => void handleTest(rule)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Выберите правило или создайте новое
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
