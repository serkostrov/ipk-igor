import { useState } from "react";
import { toast } from "sonner";
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
import type {
  ProjectGanttStage,
  ProjectGanttWorkItem,
} from "../model/contracts";
import {
  upsertProjectGanttStage,
  upsertProjectGanttWorkItem,
} from "../api/work-items-api";

export function WorkItemFormDialog({
  open,
  onOpenChange,
  projectEntityId,
  projectRecordId,
  stages,
  workItem,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectEntityId: string;
  projectRecordId: string;
  stages: readonly ProjectGanttStage[];
  workItem: ProjectGanttWorkItem | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workItem?.name ?? "");
  const [stageId, setStageId] = useState(workItem?.stageId ?? "");
  const [startDate, setStartDate] = useState(workItem?.startDate ?? "");
  const [dueDate, setDueDate] = useState(workItem?.endDate ?? "");
  const [plannedHours, setPlannedHours] = useState(
    workItem?.plannedHours != null ? String(workItem.plannedHours) : "",
  );
  const [departmentName, setDepartmentName] = useState(
    workItem?.departmentName ?? "",
  );
  const [newStageName, setNewStageName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Укажите название работы");
      return;
    }
    setSaving(true);
    try {
      let resolvedStageId = stageId || null;
      if (!resolvedStageId && newStageName.trim()) {
        const stage = await upsertProjectGanttStage({
          projectEntityId,
          projectRecordId,
          name: newStageName.trim(),
        });
        resolvedStageId = stage.id;
      }
      await upsertProjectGanttWorkItem({
        projectEntityId,
        projectRecordId,
        name: trimmed,
        stageId: resolvedStageId,
        startDate: startDate || null,
        dueDate: dueDate || null,
        plannedHours: plannedHours ? Number(plannedHours) : null,
        departmentId: departmentName.trim() || null,
        departmentName: departmentName.trim() || null,
        workItemId: workItem?.id ?? null,
      });
      toast.success(workItem ? "Работа обновлена" : "Работа создана");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось сохранить работу",
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
            {workItem ? "Редактировать работу" : "Новая работа"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="gantt-work-name">Название</Label>
            <Input
              id="gantt-work-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
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
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!stageId ? (
            <div className="grid gap-1.5">
              <Label htmlFor="gantt-new-stage">Или новый этап</Label>
              <Input
                id="gantt-new-stage"
                value={newStageName}
                onChange={(event) => setNewStageName(event.target.value)}
                placeholder="Название этапа"
              />
            </div>
          ) : null}
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
          </div>
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
          <div className="grid gap-1.5">
            <Label htmlFor="gantt-dept">Отдел</Label>
            <Input
              id="gantt-dept"
              value={departmentName}
              onChange={(event) => setDepartmentName(event.target.value)}
              placeholder="Название отдела"
            />
          </div>
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
