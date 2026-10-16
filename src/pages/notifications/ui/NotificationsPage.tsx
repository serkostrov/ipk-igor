import { NotificationInbox } from "@/features/notification-inbox";

export function NotificationsPage({
  onOpenRecord,
  onOpenTasks,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onOpenTasks?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Уведомления</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Общий инбокс: события сущностей и автоматизаций
        </p>
      </div>
      <NotificationInbox
        onOpenRecord={onOpenRecord}
        onOpenTasks={onOpenTasks}
      />
    </div>
  );
}
