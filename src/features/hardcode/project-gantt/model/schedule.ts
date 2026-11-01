import {
  addBusinessDays,
  businessDaysBetween,
} from "@/shared/lib/business-days";
import type { WorkItemDependencyType } from "./contracts";

export type ProjectGanttScheduleItem = {
  id: string;
  startDate: string | null;
  endDate: string | null;
};

export type ProjectGanttScheduleEdge = {
  predecessorWorkItemId: string;
  successorWorkItemId: string;
  dependencyType: WorkItemDependencyType;
  lagBusinessDays?: number;
};

export type ProjectGanttScheduleChange = {
  workItemId: string;
  oldStartDate: string | null;
  oldEndDate: string | null;
  newStartDate: string | null;
  newEndDate: string | null;
};

function scheduleError(message: string): never {
  throw new Error(message);
}

export function calculateProjectGanttIncomingSchedule(input: {
  successor: ProjectGanttScheduleItem;
  predecessors: ReadonlyArray<{
    dependencyType: WorkItemDependencyType;
    lagBusinessDays?: number;
    startDate: string | null;
    endDate: string | null;
  }>;
}): { startDate: string; endDate: string } {
  const duration = businessDaysBetween(
    input.successor.startDate ?? "",
    input.successor.endDate ?? "",
  );
  if (duration == null || duration < 1) {
    return scheduleError(
      `У зависимой работы ${input.successor.id} не задана рабочая длительность`,
    );
  }
  if (input.predecessors.length === 0) {
    return scheduleError(
      `У зависимой работы ${input.successor.id} нет предшественников`,
    );
  }

  const lowerBounds = input.predecessors.map((predecessor) => {
    const lag = predecessor.lagBusinessDays ?? 0;
    if (!Number.isInteger(lag) || Math.abs(lag) > 10000) {
      return scheduleError("Некорректный сдвиг зависимости в рабочих днях");
    }
    const shift = (date: string) => addBusinessDays(date, lag);
    if (
      predecessor.dependencyType === "finish_to_start" ||
      predecessor.dependencyType === "finish_to_finish"
    ) {
      if (!predecessor.endDate) {
        return scheduleError(
          `У предшественника работы ${input.successor.id} не задан срок окончания`,
        );
      }
      const bound =
        predecessor.dependencyType === "finish_to_start"
          ? addBusinessDays(predecessor.endDate, 1)
          : addBusinessDays(predecessor.endDate, -(duration - 1));
      return shift(bound);
    }

    if (!predecessor.startDate) {
      return scheduleError(
        `У предшественника работы ${input.successor.id} не задан срок начала`,
      );
    }
    const bound =
      predecessor.dependencyType === "start_to_start"
        ? predecessor.startDate
        : addBusinessDays(predecessor.startDate, -(duration - 1));
    return shift(bound);
  });
  const startDate = lowerBounds.sort().at(-1);
  const endDate = startDate ? addBusinessDays(startDate, duration - 1) : null;
  if (!startDate || !endDate) {
    return scheduleError("Не удалось рассчитать рабочие даты");
  }
  return { startDate, endDate };
}

/**
 * Pure reference model for the database cascade command. Reachable successors
 * are processed in topological order; duration in business days is preserved.
 */
export function calculateProjectGanttScheduleCascade(input: {
  items: readonly ProjectGanttScheduleItem[];
  dependencies: readonly ProjectGanttScheduleEdge[];
  rootWorkItemId: string;
  newStartDate: string | null;
  newEndDate: string | null;
}): ProjectGanttScheduleChange[] {
  const itemsById = new Map(
    input.items.map((item) => [item.id, item] as const),
  );
  const root = itemsById.get(input.rootWorkItemId);
  if (!root) return scheduleError("Корневая работа не найдена");

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, ProjectGanttScheduleEdge[]>();
  for (const edge of input.dependencies) {
    if (
      !itemsById.has(edge.predecessorWorkItemId) ||
      !itemsById.has(edge.successorWorkItemId)
    ) {
      return scheduleError("Зависимость ссылается на отсутствующую работу");
    }
    const successors = outgoing.get(edge.predecessorWorkItemId) ?? [];
    if (!successors.includes(edge.successorWorkItemId)) {
      successors.push(edge.successorWorkItemId);
    }
    outgoing.set(edge.predecessorWorkItemId, successors);
    const predecessors = incoming.get(edge.successorWorkItemId) ?? [];
    predecessors.push(edge);
    incoming.set(edge.successorWorkItemId, predecessors);
  }
  for (const values of outgoing.values()) values.sort();
  for (const values of incoming.values()) {
    values.sort(
      (left, right) =>
        left.predecessorWorkItemId.localeCompare(right.predecessorWorkItemId) ||
        left.dependencyType.localeCompare(right.dependencyType),
    );
  }

  const reachable = new Set<string>([input.rootWorkItemId]);
  const queue = [input.rootWorkItemId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const successorId of outgoing.get(current) ?? []) {
      if (reachable.has(successorId)) continue;
      reachable.add(successorId);
      queue.push(successorId);
    }
  }

  const indegree = new Map<string, number>();
  for (const id of reachable) {
    indegree.set(
      id,
      new Set(
        (incoming.get(id) ?? [])
          .map((edge) => edge.predecessorWorkItemId)
          .filter((predecessorId) => reachable.has(predecessorId)),
      ).size,
    );
  }
  const ready = [...reachable].filter((id) => indegree.get(id) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    order.push(current);
    for (const successorId of outgoing.get(current) ?? []) {
      if (!reachable.has(successorId)) continue;
      const next = (indegree.get(successorId) ?? 0) - 1;
      indegree.set(successorId, next);
      if (next === 0) {
        ready.push(successorId);
        ready.sort();
      }
    }
  }
  if (order.length !== reachable.size) {
    return scheduleError("Граф зависимостей содержит цикл");
  }

  const dates = new Map(
    input.items.map(
      (item) =>
        [
          item.id,
          { startDate: item.startDate, endDate: item.endDate },
        ] as const,
    ),
  );
  dates.set(root.id, {
    startDate: input.newStartDate,
    endDate: input.newEndDate,
  });
  const changes: ProjectGanttScheduleChange[] = [];
  if (
    root.startDate !== input.newStartDate ||
    root.endDate !== input.newEndDate
  ) {
    changes.push({
      workItemId: root.id,
      oldStartDate: root.startDate,
      oldEndDate: root.endDate,
      newStartDate: input.newStartDate,
      newEndDate: input.newEndDate,
    });
  }

  for (const workItemId of order) {
    if (workItemId === root.id) continue;
    const item = itemsById.get(workItemId)!;
    const next = calculateProjectGanttIncomingSchedule({
      successor: item,
      predecessors: (incoming.get(workItemId) ?? []).map((edge) => ({
        dependencyType: edge.dependencyType,
        lagBusinessDays: edge.lagBusinessDays,
        startDate: dates.get(edge.predecessorWorkItemId)?.startDate ?? null,
        endDate: dates.get(edge.predecessorWorkItemId)?.endDate ?? null,
      })),
    });
    dates.set(workItemId, {
      startDate: next.startDate,
      endDate: next.endDate,
    });
    if (item.startDate !== next.startDate || item.endDate !== next.endDate) {
      changes.push({
        workItemId,
        oldStartDate: item.startDate,
        oldEndDate: item.endDate,
        newStartDate: next.startDate,
        newEndDate: next.endDate,
      });
    }
  }

  return changes;
}
