import { useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  useNotificationInbox,
  useNotificationInboxStatus,
  type Notification,
} from "@/entities/notification";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { formatDatetimeDisplay } from "@/shared/lib/format-date";

const PAGE_SIZE = 20;

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
  const [page, setPage] = useState(1);
  const [pageFilter, setPageFilter] = useState(filter);

  if (pageFilter !== filter) {
    setPageFilter(filter);
    setPage(1);
  }

  const items = useMemo(() => {
    if (filter === "unread") return inbox.filter((item) => item.readAt == null);
    return inbox;
  }, [filter, inbox]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [currentPage, items]);

  const from = items.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, items.length);

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

  async function handleDelete(item: Notification) {
    try {
      await deleteNotification(item.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось удалить уведомление",
      );
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
            {pageItems.map((item) => (
              <li key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => handleOpen(item)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 pr-10 text-left transition-colors hover:bg-muted/60",
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2 size-7 text-muted-foreground opacity-70 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  aria-label="Удалить уведомление"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDelete(item);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {items.length > 0 ? (
        <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border bg-muted px-3">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {from}–{to} из {items.length}
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="default"
              size="icon-sm"
              className="size-7"
              disabled={currentPage <= 1}
              aria-label="Предыдущая страница"
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="min-w-12 px-1 text-center text-[11px] tabular-nums text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              variant="default"
              size="icon-sm"
              className="size-7"
              disabled={currentPage >= totalPages}
              aria-label="Следующая страница"
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
