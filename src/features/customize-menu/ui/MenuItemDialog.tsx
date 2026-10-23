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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { MenuIconName, MenuItem, MenuParentOption } from "@/entities/menu";
import { IconPicker } from "./IconPicker";

const ROOT_VALUE = "__root__";

type MenuItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parents: MenuParentOption[];
  initialGroupId: string | null;
  item?: MenuItem;
  onSubmit: (data: {
    label: string;
    icon: MenuIconName;
    groupId: string | null;
  }) => void;
};

function MenuItemForm({
  parents,
  initialGroupId,
  item,
  onCancel,
  onSubmit,
}: {
  parents: MenuParentOption[];
  initialGroupId: string | null;
  item: MenuItem;
  onCancel: () => void;
  onSubmit: (data: {
    label: string;
    icon: MenuIconName;
    groupId: string | null;
  }) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [icon, setIcon] = useState<MenuIconName>(item.icon);
  const [groupId, setGroupId] = useState<string | null>(initialGroupId);

  const canSubmit = label.trim().length > 0;
  const selectedParent = parents.find((parent) => parent.id === groupId);
  const selectedParentTitle =
    groupId == null
      ? "Без родителя"
      : selectedParent
        ? selectedParent.kind === "group"
          ? `Группа: ${selectedParent.label}`
          : `Сущность: ${selectedParent.label}`
        : "Без родителя";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Редактировать пункт</DialogTitle>
        <DialogDescription>
          Название, иконка и место в навигации. Можно вложить в группу или в
          другую сущность.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="menu-item-label">Название</Label>
          <Input
            id="menu-item-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Например, Проекты"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Родитель</Label>
          <Select
            value={groupId ?? ROOT_VALUE}
            onValueChange={(value) => {
              if (value == null || value === ROOT_VALUE) {
                setGroupId(null);
                return;
              }
              setGroupId(String(value));
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{selectedParentTitle}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT_VALUE}>Без родителя</SelectItem>
              {parents.map((parent) => (
                <SelectItem key={parent.id} value={parent.id}>
                  <span
                    style={
                      parent.depth > 0
                        ? { paddingLeft: Math.min(parent.depth, 4) * 12 }
                        : undefined
                    }
                  >
                    {parent.kind === "group"
                      ? `Группа: ${parent.label}`
                      : `Сущность: ${parent.label}`}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Иконка</Label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Отмена
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit({
              label: label.trim(),
              icon,
              groupId,
            });
            onCancel();
          }}
        >
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}

export function MenuItemDialog({
  open,
  onOpenChange,
  parents,
  initialGroupId,
  item,
  onSubmit,
}: MenuItemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && item ? (
          <MenuItemForm
            key={item.id}
            parents={parents}
            initialGroupId={initialGroupId}
            item={item}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
