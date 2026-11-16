import { ArrowRightLeft, Plus } from "lucide-react";
import {
  describeNotificationTrigger,
  type NotificationRule,
} from "@/entities/notification";
import {
  getEntityFieldDisplayName,
  getEntityDisplayName,
  type Entity,
} from "@/entities/entity";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/cn";
import type { RegistryStage } from "../model/notification-registry";

export function StageNotificationsPanel({
  entity,
  stage,
  stageFieldId,
  rules,
  selectedRuleId,
  busy = false,
  onSelectRule,
  onToggleRule,
  onAddStageEnter,
  onAddAnyStageChange,
}: {
  entity: Entity;
  stage: RegistryStage;
  stageFieldId: string;
  rules: readonly NotificationRule[];
  selectedRuleId?: string | null;
  busy?: boolean;
  onSelectRule: (ruleId: string) => void;
  onToggleRule: (rule: NotificationRule, enabled: boolean) => void;
  onAddStageEnter: () => void;
  onAddAnyStageChange: () => void;
}) {
  const stageField = entity.fields.find((field) => field.id === stageFieldId);
  const fieldLabel = stageField
    ? getEntityFieldDisplayName(stageField)
    : "Стадия";
  const concreteStage = stage.stageKey !== "__any__" && Boolean(stage.stageKey);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug tracking-tight">
              {stage.stageName}
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {getEntityDisplayName(entity)} · уведомления о смене стадии
              {stageField ? ` · поле «${fieldLabel}»` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {concreteStage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                disabled={busy || !stageFieldId}
                onClick={onAddStageEnter}
                title="Уведомить при входе именно на эту стадию"
              >
                <Plus className="size-3.5" />
                Вход на стадию
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy || !stageFieldId}
              onClick={onAddAnyStageChange}
              title="Уведомить при любой смене стадии"
            >
              <ArrowRightLeft className="size-3.5" />
              Любая смена
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!stageFieldId ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
            У процесса этой сущности не задано поле стадии. Укажите list-поле
            триггера в автоматизации — тогда здесь можно настроить уведомления.
          </p>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
            <ArrowRightLeft
              className="size-7 text-muted-foreground/45"
              aria-hidden
            />
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium">Нет уведомлений о стадии</p>
              <p className="text-xs text-muted-foreground">
                {concreteStage
                  ? `Добавьте правило «Вход на стадию», чтобы оповестить нужных людей, когда запись переходит в «${stage.stageName}».`
                  : "Добавьте правило, чтобы оповещать о любой смене стадии записи."}
              </p>
            </div>
            {concreteStage ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={onAddStageEnter}
              >
                <Plus className="size-3.5" />
                Вход на «{stage.stageName}»
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={onAddAnyStageChange}
              >
                <Plus className="size-3.5" />
                Смена стадии
              </Button>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => {
              const active = selectedRuleId === rule.id;
              return (
                <li key={rule.id}>
                  <button
                    type="button"
                    onClick={() => onSelectRule(rule.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/70 bg-card hover:bg-muted/40",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {rule.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {describeNotificationTrigger(rule)}
                      </span>
                    </span>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(enabled) => onToggleRule(rule, enabled)}
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
  );
}
