import { MessengerPanel } from "@/features/messenger-panel";
import { useMessengerPanelOpen } from "@/entities/messenger";
import { cn } from "@/shared/lib/cn";

export function MessengerDock({
  onOpenRecord,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const open = useMessengerPanelOpen();
  if (!open) return null;

  return (
    <div
      className={cn(
        "flex h-full shrink-0 overflow-hidden border-l border-border bg-background",
        "w-full max-w-full sm:w-[min(100vw,26rem)] lg:w-[32rem]",
      )}
    >
      <MessengerPanel onOpenRecord={onOpenRecord} />
    </div>
  );
}
