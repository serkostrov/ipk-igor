import { useMemo, useState, type ReactNode } from "react";
import { GitBranch, Plus } from "lucide-react";
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
import { useAutomationConfig } from "@/entities/automation";
import { findSystemUserByAuthId, useEntityConfig } from "@/entities/entity";
import { useSessionUser } from "@/entities/session";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/cn";
import { pluralRu } from "@/shared/lib/plural";
import { AutomationNotificationsPanel } from "./AutomationNotificationsPanel";
import { NotificationRuleEditor } from "./NotificationRuleEditor";

type Selection = { kind: "automation" } | { kind: "rule"; id: string };

export function NotificationSettings({ leading }: { leading?: ReactNode }) {
  const { rules } = useNotificationConfig();
  const status = useNotificationStatus();
  const { notificationRules: automationRules } = useAutomationConfig();
  const { entities } = useEntityConfig();
  const sessionUser = useSessionUser();
  const [selection, setSelection] = useState<Selection>({
    kind: "automation",
  });
  const [busy, setBusy] = useState(false);

  const selectedRule =
    selection.kind === "rule"
      ? (rules.find((rule) => rule.id === selection.id) ?? null)
      : null;

  const entityNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entity of entities) {
      map.set(entity.id, entity.namePlural || entity.name);
    }
    return map;
  }, [entities]);

  const automationCountLabel =
    automationRules.length > 0
      ? `${automationRules.length} ${pluralRu(
          automationRules.length,
          "правило",
          "правила",
          "правил",
        )}`
      : "Задания";

  async function handleAdd() {
    const entityId = entities[0]?.id;
    if (!entityId) return;
    const rule = createDefaultNotificationRule(entityId);
    setBusy(true);
    try {
      await saveNotificationRule(rule);
      setSelection({ kind: "rule", id: rule.id });
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(rule: NotificationRule) {
    setBusy(true);
    try {
      await saveNotificationRule(rule);
      setSelection({ kind: "rule", id: rule.id });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(ruleId: string) {
    setBusy(true);
    try {
      await removeNotificationRule(ruleId);
      setSelection({ kind: "automation" });
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
      <div className="min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {leading}
      </div>
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
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Системные
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelection({ kind: "automation" })}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      selection.kind === "automation"
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                        selection.kind === "automation"
                          ? "border-border/60 bg-background/70"
                          : "border-border/70 bg-muted/40 text-muted-foreground",
                      )}
                    >
                      <GitBranch className="size-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium">
                          Автоматизации
                        </p>
                        <span className="rounded px-1 py-px text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
                          сист.
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {automationCountLabel} · назначение / завершение /
                        просрочка
                      </p>
                    </div>
                  </button>
                </div>

                <div>
                  <p className="px-2 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Сущности
                  </p>
                  {rules.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      Пока нет правил по сущностям. Создайте первое.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {rules.map((rule) => {
                        const active =
                          selection.kind === "rule" && selection.id === rule.id;
                        return (
                          <li key={rule.id}>
                            <button
                              type="button"
                              onClick={() =>
                                setSelection({ kind: "rule", id: rule.id })
                              }
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
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {selection.kind === "automation" ? (
            <AutomationNotificationsPanel />
          ) : selectedRule ? (
            <NotificationRuleEditor
              key={selectedRule.id}
              rule={selectedRule}
              entities={entities}
              onSave={(rule) => void handleSave(rule)}
              onDelete={() => void handleDelete(selectedRule.id)}
              onTest={(rule) => void handleTest(rule)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Выберите правило или откройте блок «Автоматизации»
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
