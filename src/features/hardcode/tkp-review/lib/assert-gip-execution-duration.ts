/**
 * Block completing «Заполнить разбор ТКП ГИПа» without «Общий срок расчёта».
 * The control is hardcode (soft key / matched field) — not pickable in
 * automation «Запросить заполнение полей».
 */

import { registerBeforeAutomationTaskCompleteHook } from "@/entities/automation/lib/hardcode-hooks";
import {
  getEntityConfig,
  isTkpAnalysisEntity,
  isTkpGipFillingOptionId,
} from "@/entities/entity";
import { readTkpGipExecutionDurationDays } from "../model/match-related";

function normalizeTaskName(name: string): string {
  return name.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

/** GIP fill task: stage option «…ГИПа» or name contains «гип» + заполн/разбор. */
export function isTkpGipFillAutomationTask(options: {
  entityId: string;
  triggerOptionId?: string | null;
  taskName?: string | null;
}): boolean {
  const entities = getEntityConfig().entities;
  const entity = entities.find((item) => item.id === options.entityId) ?? null;
  if (!entity || !isTkpAnalysisEntity(entity)) return false;

  const optionId = options.triggerOptionId?.trim() ?? "";
  if (optionId && isTkpGipFillingOptionId(entity, optionId, entities)) {
    return true;
  }

  const name = normalizeTaskName(options.taskName ?? "");
  if (!name.includes("гип")) return false;
  return name.includes("заполн") || name.includes("разбор");
}

export function assertTkpGipExecutionDurationForComplete(options: {
  entityId: string;
  recordId: string;
  values: Record<string, string>;
  triggerOptionId?: string | null;
  taskName?: string | null;
}): void {
  if (
    !isTkpGipFillAutomationTask({
      entityId: options.entityId,
      triggerOptionId: options.triggerOptionId,
      taskName: options.taskName,
    })
  ) {
    return;
  }

  const entities = getEntityConfig().entities;
  const entity = entities.find((item) => item.id === options.entityId);
  if (!entity) return;

  const days = readTkpGipExecutionDurationDays(options.values, entity);
  if (days == null) {
    throw new Error(
      "Укажите «Общий срок расчёта» в блоке «Расчёт ГИПа» перед завершением задания",
    );
  }
}

registerBeforeAutomationTaskCompleteHook((args) => {
  assertTkpGipExecutionDurationForComplete(args);
});
