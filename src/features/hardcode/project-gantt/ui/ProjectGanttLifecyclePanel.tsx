import { useMemo, useState } from "react";
import { Check, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/cn";
import type {
  ProjectGanttLifecycle,
  ProjectGanttRevisionStatus,
  ProjectGanttSnapshot,
} from "../model/contracts";
import {
  decideProjectGanttRevision,
  setProjectGanttLeadingDepartment,
  startProjectGanttRevision,
  submitProjectGanttRevision,
} from "../api/gantt-lifecycle-api";

const STATUS_LABELS: Record<ProjectGanttRevisionStatus, string> = {
  draft: "Черновик",
  leading_review: "Согласование ведущим отделом",
  department_review: "Согласование участвующими отделами",
  rework: "Возвращено на доработку",
  approved: "Согласовано",
  published: "Опубликовано",
  superseded: "Заменено новой ревизией",
};

function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function ProjectGanttLifecyclePanel({
  projectEntityId,
  projectRecordId,
  lifecycle,
  snapshot,
  entityLeadingDepartment = null,
  actorName,
  canManage,
  onChanged,
  embedded = false,
}: {
  projectEntityId: string;
  projectRecordId: string;
  lifecycle: ProjectGanttLifecycle | null;
  snapshot: ProjectGanttSnapshot | null;
  /** From project Entity field «Ведущий отдел» — preferred source of truth. */
  entityLeadingDepartment?: { id: string; name: string } | null;
  actorName: string | null;
  canManage: boolean;
  onChanged: () => void;
  /** When true, skip outer card chrome (parent already provides it). */
  embedded?: boolean;
}) {
  const resolvedLeading =
    entityLeadingDepartment ?? lifecycle?.leadingDepartment ?? null;
  const [leadingName, setLeadingName] = useState(resolvedLeading?.name ?? "");
  const [rejectComment, setRejectComment] = useState("");
  const [busy, setBusy] = useState(false);

  const commands = useMemo(
    () => new Set(lifecycle?.availableCommands ?? []),
    [lifecycle?.availableCommands],
  );

  const leadingFromEntity = entityLeadingDepartment != null;
  const showManualLeadingAssign =
    canManage &&
    commands.has("leading_department.change") &&
    !leadingFromEntity;

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await action();
      toast.success(ok);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось выполнить команду",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!lifecycle) return null;

  return (
    <div
      className={cn(
        "space-y-3",
        !embedded && "mb-3 rounded-lg border border-border bg-card p-3",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {embedded ? null : (
            <p className="text-sm font-medium text-foreground">
              Согласование графика
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {lifecycle.currentRevision
              ? `Ревизия №${lifecycle.currentRevision.revisionNumber} · ${STATUS_LABELS[lifecycle.currentRevision.status]}`
              : lifecycle.publishedRevision
                ? `Опубликована ревизия №${lifecycle.publishedRevision.revisionNumber}`
                : "Ревизий пока нет"}
          </p>
        </div>
        {lifecycle.baselineFixation ? (
          <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            Baseline №{lifecycle.baselineFixation.revisionNumber}
          </span>
        ) : null}
      </div>

      {showManualLeadingAssign ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-[200px] flex-1 gap-1.5">
            <Label htmlFor="gantt-leading-dept">Ведущий отдел</Label>
            <Input
              id="gantt-leading-dept"
              value={leadingName}
              onChange={(event) => setLeadingName(event.target.value)}
              placeholder="Название отдела"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy || !leadingName.trim()}
            onClick={() =>
              void run(async () => {
                const name = leadingName.trim();
                await setProjectGanttLeadingDepartment({
                  projectEntityId,
                  projectRecordId,
                  departmentId: name,
                  departmentName: name,
                  expectedDepartmentId: lifecycle.leadingDepartment?.id ?? null,
                });
              }, "Ведущий отдел сохранён")
            }
          >
            Назначить
          </Button>
        </div>
      ) : resolvedLeading ? (
        <p className="text-xs text-muted-foreground">
          Ведущий отдел:{" "}
          <span className="font-medium text-foreground">
            {resolvedLeading.name}
          </span>
          {leadingFromEntity ? (
            <span className="ml-1 text-muted-foreground/80">
              · из карточки проекта
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canManage && commands.has("revision.start") && snapshot ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await startProjectGanttRevision({
                  projectEntityId,
                  projectRecordId,
                  snapshot,
                  contentHash: String(Date.now()),
                  idempotencyKey: newIdempotencyKey(),
                  createdByName: actorName,
                });
              }, "Ревизия создана")
            }
          >
            Начать ревизию
          </Button>
        ) : null}
        {canManage &&
        commands.has("revision.submit") &&
        lifecycle.currentRevision ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await submitProjectGanttRevision({
                  revisionId: lifecycle.currentRevision!.id,
                  idempotencyKey: newIdempotencyKey(),
                  actorName,
                });
              }, "Отправлено на согласование")
            }
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            Отправить
          </Button>
        ) : null}
      </div>

      {lifecycle.decisions.length > 0 ? (
        <div className="space-y-2">
          {lifecycle.decisions.map((decision) => (
            <div
              key={decision.recipientId}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2",
                decision.decision === "approved" &&
                  "border-emerald-600/40 bg-emerald-50/70 dark:bg-emerald-950/25",
                decision.decision === "rejected" &&
                  "border-destructive/40 bg-destructive/5",
              )}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {decision.department.name}
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {decision.role === "leading" ? "ведущий" : "участник"}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {decision.decision === "pending"
                    ? "Ожидает решения"
                    : decision.decision === "approved"
                      ? "Согласовано"
                      : decision.decision === "rejected"
                        ? `Отклонено${decision.comment ? `: ${decision.comment}` : ""}`
                        : "Заменено"}
                </p>
              </div>
              {canManage && decision.availableActions.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  {decision.availableActions.includes("reject") ? (
                    <Input
                      className="h-8 w-40 text-xs"
                      placeholder="Комментарий отказа"
                      value={rejectComment}
                      onChange={(event) => setRejectComment(event.target.value)}
                    />
                  ) : null}
                  {decision.availableActions.includes("approve") ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || !lifecycle.currentRevision}
                      onClick={() =>
                        void run(async () => {
                          await decideProjectGanttRevision({
                            revisionId: lifecycle.currentRevision!.id,
                            departmentId: decision.department.id,
                            decision: "approve",
                            idempotencyKey: newIdempotencyKey(),
                            actorName,
                          });
                        }, "Согласовано")
                      }
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      ОК
                    </Button>
                  ) : null}
                  {decision.availableActions.includes("reject") ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy || !lifecycle.currentRevision}
                      onClick={() =>
                        void run(async () => {
                          await decideProjectGanttRevision({
                            revisionId: lifecycle.currentRevision!.id,
                            departmentId: decision.department.id,
                            decision: "reject",
                            comment: rejectComment,
                            idempotencyKey: newIdempotencyKey(),
                            actorName,
                          });
                          setRejectComment("");
                        }, "Отклонено")
                      }
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Отклонить
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {lifecycle.history.length > 0 ? (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            История
          </p>
          {lifecycle.history.slice(0, 5).map((entry) => (
            <p key={entry.id} className="text-[11px] text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString("ru-RU")} ·{" "}
              {entry.action}
              {entry.actor.name ? ` · ${entry.actor.name}` : ""}
            </p>
          ))}
        </div>
      ) : null}

      {canManage && commands.has("revision.reject") ? (
        <Textarea
          className="hidden"
          value={rejectComment}
          onChange={(event) => setRejectComment(event.target.value)}
        />
      ) : null}
    </div>
  );
}
