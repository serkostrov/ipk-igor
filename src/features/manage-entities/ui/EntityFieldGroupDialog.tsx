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
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";

export type EntityFieldGroupFormData = {
  name: string;
  metrics: boolean;
  /** Empty name → no header on the record page. */
  hideTitle: boolean;
};

type EntityFieldGroupDialogProps = {
  open: boolean;
  mode?: "create" | "edit";
  initialName?: string;
  initialMetrics?: boolean;
  initialHideTitle?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: EntityFieldGroupFormData) => void;
};

function EntityFieldGroupForm({
  mode,
  initialName,
  initialMetrics,
  initialHideTitle,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initialName: string;
  initialMetrics: boolean;
  initialHideTitle: boolean;
  onCancel: () => void;
  onSubmit: (data: EntityFieldGroupFormData) => void;
}) {
  const [name, setName] = useState(initialHideTitle ? "" : initialName);
  const [metrics, setMetrics] = useState(initialMetrics);
  const isEdit = mode === "edit";

  function submit() {
    const trimmed = name.trim();
    onSubmit({
      name: trimmed,
      metrics,
      hideTitle: trimmed.length === 0,
    });
    onCancel();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Редактировать группу" : "Новая группа"}
        </DialogTitle>
        <DialogDescription>
          Название блока для полей. Если оставить пустым — на карточке записи
          шапки не будет.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="entity-field-group-name">Название</Label>
          <Input
            id="entity-field-group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Необязательно"
            autoFocus
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              submit();
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label htmlFor="entity-field-group-metrics">Показатели</Label>
            <span className="text-xs text-muted-foreground">
              Плитки с крупными значениями в карточке записи
            </span>
          </div>
          <Switch
            id="entity-field-group-metrics"
            checked={metrics}
            onCheckedChange={setMetrics}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" onClick={submit}>
          {isEdit ? "Сохранить" : "Создать"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EntityFieldGroupDialog({
  open,
  mode = "create",
  initialName = "",
  initialMetrics = false,
  initialHideTitle = false,
  onOpenChange,
  onSubmit,
}: EntityFieldGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <EntityFieldGroupForm
            key={`${mode}-${initialName}-${initialHideTitle}`}
            mode={mode}
            initialName={initialName}
            initialMetrics={initialMetrics}
            initialHideTitle={initialHideTitle}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
