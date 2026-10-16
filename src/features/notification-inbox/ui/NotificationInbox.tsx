import { useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import {
  markAllNotificationsRead,
  markNotificationRead,
  useNotificationInbox,
  useNotificationInboxStatus,
  type Notification,
} from "@/entities/notification";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { formatDatetimeDisplay } from "@/shared/lib/format-date";

export function NotificationInbox({
  onOpenRecord,
  onOpenTasks,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onOpenTasks?: () => void;
}) {
  const inbox = useNotificationInbox();
  const status = useNotificationInboxStatus();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const items = useMemo(() => {
    if (filter === "unread") return inbox.filter((item) => item.readAt == null);
    return inbox;
  }, [filter, inbox]);

  function handleOpen(item: Notification) {
    if (item.readAt == null) {
      void markNotificationRead(item.id);
    }
    if (item.entityId && item.recordId && onOpenRecord) {
      onOpenRecord(item.entityId, item.recordId);
      return;
    }
    if (item.taskId && onOpenTasks) {
      onOpenTasks();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold">Уведомления</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={filter === "all" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setFilter("all")}
          >
            Все
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "unread" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setFilter("unread")}
          >
            Непрочитанные
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => void markAllNotificationsRead()}
          >
            <CheckCheck className="size-3.5" />
            Прочитать все
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {status === "loading" ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
        ) : items.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-muted-foreground">
            {filter === "unread"
              ? "Нет непрочитанных уведомлений"
              : "Пока нет уведомлений"}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleOpen(item)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    item.readAt == null && "bg-accent/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {item.title || "Уведомление"}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDatetimeDisplay(item.createdAt)}
                    </span>
                  </div>
                  {item.message ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {item.message}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
