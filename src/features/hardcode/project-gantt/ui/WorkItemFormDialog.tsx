import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  resolveEntityListFieldOptions,
  useEntityConfig,
} from "@/entities/entity";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { upsertProjectGanttTaskRecord } from "../api/tasks-gantt-api";
import type { ProjectGanttWorkItem } from "../model/contracts";
import type { ProjectGanttTasksBinding } from "../model/tasks-snapshot";

export function WorkItemFormDialog({
  open,
  onOpenChange,
  binding,
  workItem,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: ProjectGanttTasksBinding;
  workItem: ProjectGanttWorkItem | null;
  onSaved: () => void;
}) {
  const { entities } = useEntityConfig();
  const stageOptions = useMemo(() => {
    const field = binding.fields.stageField;
    if (!field || field.type !== "list") return [];
    return resolveEntityListFieldOptions(field, entities);
  }, [binding.fields.stageField, entities]);

  const [name, setName] = useState(workItem?.name ?? "");
  const [stageId, setStageId] = useState(workItem?.stageId ?? "");
  const [startDate, setStartDate] = useState(workItem?.startDate ?? "");
  const [dueDate, setDueDate] = useState(workItem?.endDate ?? "");
  const [plannedHours, setPlannedHours] = useState(
    workItem?.plannedHours != null ? String(workItem.plannedHours) : "",
  );
  const [saving, setSaving] = useState(false);

  const hasDateFields = binding.hasScheduleDates;
  const showHours = binding.fields.hoursField != null;
  const showStage = binding.fields.stageField != null;

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Укажите название задачи");
      return;
    }
    if (!workItem && hasDateFields && !startDate && !dueDate) {
      toast.error(
        "Укажите хотя бы одну дату — иначе полоски на графике не будет",
      );
      return;
    }
    if (startDate && dueDate && startDate > dueDate) {
      toast.error("Дата начала не может быть позже окончания");
      return;
    }

    setSaving(true);
    try {
      upsertProjectGanttTaskRecord({
        binding,
        name: trimmed,
        stageId: stageId || null,
        startDate: startDate || dueDate || null,
        dueDate: dueDate || startDate || null,
        plannedHours: plannedHours ? Number(plannedHours) : null,
        departmentId: workItem?.departmentId ?? null,
        workItemId: workItem?.id ?? null,
      });
      toast.success(
        workItem ? "Задача обновлена" : "Задача добавлена в график",
      );
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить задачу",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {workItem ? "Редактировать задачу" : "Новая задача"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="gantt-work-name">Название</Label>
            <Input
              id="gantt-work-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          {showStage ? (
            <div className="grid gap-1.5">
              <Label>Этап</Label>
              <Select
                value={stageId || "__none__"}
                onValueChange={(value) =>
                  setStageId(!value || value === "__none__" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без этапа" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без этапа</SelectItem>
                  {stageOptions.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {hasDateFields ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-start">Начало</Label>
                <Input
                  id="gantt-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="gantt-due">Окончание</Label>
                <Input
                  id="gantt-due"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
              <p className="col-span-2 text-[11px] text-muted-foreground">
                Без дат задача появится в списке слева, но полоски на шкале не
                будет.
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              У сущности «Задачи» нет полей дат. Добавьте даты начала и
              окончания или настройте «График» в настройках сущности.
            </p>
          )}
          {showHours ? (
            <div className="grid gap-1.5">
              <Label htmlFor="gantt-hours">Плановые часы</Label>
              <Input
                id="gantt-hours"
                type="number"
                min={0}
                step={0.5}
                value={plannedHours}
                onChange={(event) => setPlannedHours(event.target.value)}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
