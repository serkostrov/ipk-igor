import { useState } from "react";
import { MessageCirclePlus, Users } from "lucide-react";
import {
  MessengerCreateDialog,
  MessengerPanel,
} from "@/features/messenger-panel";
import { Button } from "@/shared/ui/button";

export function MessengerPage({
  onOpenRecord,
}: {
  onOpenRecord?: (entityId: string, recordId: string) => void;
}) {
  const [createMode, setCreateMode] = useState<"direct" | "group" | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4 md:px-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Чаты</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Переписка с коллегами и чаты по записям CRM
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9"
            title="Новый чат"
            onClick={() => setCreateMode("direct")}
          >
            <MessageCirclePlus className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-9"
            title="Групповой чат"
            onClick={() => setCreateMode("group")}
          >
            <Users className="size-4" />
          </Button>
        </div>
      </header>

      <MessengerPanel
        className="min-h-0 flex-1"
        onOpenRecord={onOpenRecord}
      />

      <MessengerCreateDialog
        open={createMode != null}
        mode={createMode ?? "direct"}
        onOpenChange={(open) => {
          if (!open) setCreateMode(null);
        }}
      />
    </div>
  );
}
