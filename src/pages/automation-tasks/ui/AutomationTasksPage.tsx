import { TaskTableView } from "@/features/automation-tasks";
import { useAppNavigate } from "@/shared/lib/navigation";
import { AutomationTaskPage } from "./AutomationTaskPage";

export function AutomationTasksPage({
  taskId,
  onOpenRecord,
}: {
  taskId?: string | null;
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const { openTask, back } = useAppNavigate();

  if (taskId) {
    return (
      <AutomationTaskPage
        taskId={taskId}
        onBack={() => back({ type: "tasks" })}
        onOpenRecord={onOpenRecord}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6 md:p-8">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          Задачи автоматизаций
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Все активные шаги процессов — откройте строку, чтобы выполнить задачу
        </p>
      </div>
      <TaskTableView onOpenTask={openTask} onOpenRecord={onOpenRecord} />
    </div>
  );
}
