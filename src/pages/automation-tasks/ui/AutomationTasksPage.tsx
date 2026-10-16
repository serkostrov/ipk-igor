import { TaskInbox } from "@/features/automation-tasks";

export function AutomationTasksPage({
  onOpenRecord,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Задачи автоматизаций
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inbox процессов: blocking, outcomes, SLA
        </p>
      </div>
      <TaskInbox onOpenRecord={onOpenRecord} />
    </div>
  );
}
