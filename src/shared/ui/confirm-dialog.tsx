import { useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Extra action (e.g. «Удалить с автоматизацией»). */
  secondaryConfirmLabel?: string;
  onSecondaryConfirm?: () => void | Promise<void>;
  secondaryDestructive?: boolean;
  confirmDisabled?: boolean;
  secondaryDisabled?: boolean;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Удалить",
  cancelLabel = "Отмена",
  destructive = true,
  onConfirm,
  secondaryConfirmLabel,
  onSecondaryConfirm,
  secondaryDestructive = true,
  confirmDisabled = false,
  secondaryDisabled = false,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const hasSecondary =
    Boolean(secondaryConfirmLabel) && typeof onSecondaryConfirm === "function";

  async function run(action: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      onOpenChange(false);
    } catch {
      // Keep dialog open; caller shows the error.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={hasSecondary ? "sm:max-w-lg" : "sm:max-w-md"}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={
              hasSecondary ? "outline" : destructive ? "destructive" : "default"
            }
            disabled={busy || confirmDisabled}
            onClick={() => void run(onConfirm)}
          >
            {confirmLabel}
          </Button>
          {hasSecondary ? (
            <Button
              type="button"
              variant={secondaryDestructive ? "destructive" : "default"}
              disabled={busy || secondaryDisabled}
              onClick={() => void run(onSecondaryConfirm!)}
            >
              {secondaryConfirmLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
