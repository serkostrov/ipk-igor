import { useState } from "react";
import { Bell } from "lucide-react";
import {
  markNotificationRead,
  useNotificationInbox,
  useUnreadNotificationCount,
  type Notification,
} from "@/entities/notification";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/lib/cn";
import { formatDatetimeDisplay } from "@/shared/lib/format-date";

export function NotificationBell({
  onOpenAll,
  onOpenRecord,
  onOpenTasks,
}: {
  onOpenAll?: () => void;
  onOpenRecord?: (entityId: string, recordId: string) => void;
  onOpenTasks?: () => void;
}) {
  const inbox = useNotificationInbox();
  const unread = useUnreadNotificationCount();
  const [open, setOpen] = useState(false);
  const recent = inbox.slice(0, 8);

  function handleOpen(item: Notification) {
    if (item.readAt == null) {
      void markNotificationRead(item.id);
    }
    setOpen(false);
    if (item.entityId && item.recordId && onOpenRecord) {
      onOpenRecord(item.entityId, item.recordId);
      return;
    }
    if (item.taskId && onOpenTasks) {
      onOpenTasks();
      return;
    }
    onOpenAll?.();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="relative shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label={
              unread > 0
                ? `Уведомления, непрочитанных: ${unread}`
                : "Уведомления"
            }
          />
        }
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Уведомления</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setOpen(false);
              onOpenAll?.();
            }}
          >
            Все
          </Button>
        </div>
        <div className="max-h-80 overflow-auto p-1">
          {recent.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              Пока тихо
            </p>
          ) : (
            recent.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpen(item)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-muted/70",
                  item.readAt == null && "bg-accent/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium">
                    {item.title || "Уведомление"}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDatetimeDisplay(item.createdAt)}
                  </span>
                </div>
                {item.message ? (
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">
                    {item.message}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
