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
import type { MenuGroup, MenuIconName, MenuItem } from "@/entities/menu";
import { IconPicker } from "./IconPicker";

const ROOT_VALUE = "__root__";

type MenuItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: MenuGroup[];
  initialGroupId: string | null;
  item?: MenuItem;
  onSubmit: (data: {
    label: string;
    icon: MenuIconName;
    groupId: string | null;
  }) => void;
};

function MenuItemForm({
  groups,
  initialGroupId,
  item,
  onCancel,
  onSubmit,
}: {
  groups: MenuGroup[];
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
  const selectedGroupTitle =
    groupId == null
      ? "Без группы"
      : groups.find((group) => group.id === groupId)?.title.trim() ||
        "Без названия";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Редактировать пункт</DialogTitle>
        <DialogDescription>
          Название, иконка и место в навигации. Без группы — обычная вкладка.
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
          <Label>Группа</Label>
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
              <SelectValue>{selectedGroupTitle}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT_VALUE}>Без группы</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.title.trim() || "Без названия"}
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
  groups,
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
            groups={groups}
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
