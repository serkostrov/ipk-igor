/**
 * Lightweight parity checks for cascade / cycle logic (no test runner).
 * Import and call `assertProjectGanttScheduleParity()` from a console/debug
 * session when verifying against ipk-new fixtures.
 */
import { wouldCreateDependencyCycle } from "./dependency-graph";
import { calculateProjectGanttScheduleCascade } from "./schedule";

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}\nexpected: ${right}\nactual: ${left}`);
  }
}

export function assertProjectGanttScheduleParity() {
  const changes = calculateProjectGanttScheduleCascade({
    items: [
      { id: "a", startDate: "2026-11-02", endDate: "2026-11-04" },
      { id: "b", startDate: "2026-11-05", endDate: "2026-11-06" },
    ],
    dependencies: [
      {
        predecessorWorkItemId: "a",
        successorWorkItemId: "b",
        dependencyType: "finish_to_start",
        lagBusinessDays: 0,
      },
    ],
    rootWorkItemId: "a",
    newStartDate: "2026-11-03",
    newEndDate: "2026-11-05",
  });

  assertEqual(
    changes,
    [
      {
        workItemId: "a",
        oldStartDate: "2026-11-02",
        oldEndDate: "2026-11-04",
        newStartDate: "2026-11-03",
        newEndDate: "2026-11-05",
      },
      {
        workItemId: "b",
        oldStartDate: "2026-11-05",
        oldEndDate: "2026-11-06",
        newStartDate: "2026-11-06",
        newEndDate: "2026-11-09",
      },
    ],
    "FS cascade",
  );

  if (
    !wouldCreateDependencyCycle(
      [
        { id: "1", predecessorWorkItemId: "a", successorWorkItemId: "b" },
        { id: "2", predecessorWorkItemId: "b", successorWorkItemId: "c" },
      ],
      { predecessorWorkItemId: "c", successorWorkItemId: "a" },
    )
  ) {
    throw new Error("cycle detection failed");
  }

  return true;
}
