import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  useActiveMessengerChatId,
  useMessengerChats,
  useShowArchivedChats,
} from "@/entities/messenger";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import { cn } from "@/shared/lib/cn";
import { MessengerChatList } from "./MessengerChatList";
import { MessengerThread } from "./MessengerThread";

const CHAT_LIST_WIDTH_KEY = "messenger.chatListWidth";
const CHAT_LIST_WIDTH_DEFAULT = 352;
const CHAT_LIST_WIDTH_MIN = 240;
const CHAT_LIST_WIDTH_MAX = 560;

function parseChatListWidth(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function clampChatListWidth(value: number): number {
  return Math.min(
    CHAT_LIST_WIDTH_MAX,
    Math.max(CHAT_LIST_WIDTH_MIN, Math.round(value)),
  );
}

export function MessengerPanel({
  onOpenRecord,
  className,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
  className?: string;
}) {
  const activeChatId = useActiveMessengerChatId();
  const chats = useMessengerChats();
  const showArchived = useShowArchivedChats();
  const [mobileThread, setMobileThread] = useState(false);
  const [listWidth, setListWidth] = useLocalStorageState(
    CHAT_LIST_WIDTH_KEY,
    parseChatListWidth,
    CHAT_LIST_WIDTH_DEFAULT,
  );
  const [resizing, setResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const hasChats = chats.some((chat) =>
    showArchived ? chat.status === "archived" : chat.status === "active",
  );
  const showThreadPane = Boolean(activeChatId) || hasChats;
  const asideWidth = clampChatListWidth(listWidth);

  const onResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const panelLeft = panelRef.current?.getBoundingClientRect().left ?? 0;
      const pointerId = event.pointerId;
      const target = event.currentTarget;
      target.setPointerCapture(pointerId);
      setResizing(true);

      const onMove = (moveEvent: PointerEvent) => {
        setListWidth(clampChatListWidth(moveEvent.clientX - panelLeft));
      };
      const onUp = () => {
        setResizing(false);
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // already released
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [setListWidth],
  );

  useEffect(() => {
    if (!resizing) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [resizing]);

  if (!hasChats && !showArchived) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6",
          className,
        )}
      >
        <p className="text-sm font-medium text-foreground">Пока нет чатов</p>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          Создайте чат кнопками вверху справа
        </p>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn("flex min-h-0 w-full flex-1 overflow-hidden", className)}
      aria-label="Чаты"
    >
      <aside
        className={cn(
          "relative flex min-h-0 w-full shrink-0 flex-col border-r border-border bg-card md:w-[var(--messenger-list-width)]",
          mobileThread && activeChatId ? "hidden md:flex" : "flex",
        )}
        style={
          {
            "--messenger-list-width": `${asideWidth}px`,
          } as CSSProperties
        }
      >
        <MessengerChatList
          activeChatId={activeChatId}
          onOpenChat={() => setMobileThread(true)}
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Изменить ширину списка чатов"
          aria-valuemin={CHAT_LIST_WIDTH_MIN}
          aria-valuemax={CHAT_LIST_WIDTH_MAX}
          aria-valuenow={asideWidth}
          tabIndex={0}
          className={cn(
            "absolute top-0 right-0 z-10 hidden h-full w-1.5 translate-x-1/2 cursor-col-resize touch-none md:block",
            "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent",
            "hover:after:bg-primary/40",
            resizing && "after:bg-primary",
          )}
          onPointerDown={onResizeStart}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setListWidth(clampChatListWidth(asideWidth - 16));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setListWidth(clampChatListWidth(asideWidth + 16));
            }
          }}
        />
      </aside>

      {showThreadPane ? (
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-background",
            mobileThread && activeChatId ? "flex" : "hidden md:flex",
          )}
        >
          <MessengerThread
            onBack={() => setMobileThread(false)}
            onOpenRecord={onOpenRecord}
          />
        </section>
      ) : (
        <section className="hidden min-h-0 min-w-0 flex-1 items-center justify-center md:flex">
          <p className="text-sm text-muted-foreground">Выберите чат</p>
        </section>
      )}
    </div>
  );
}
