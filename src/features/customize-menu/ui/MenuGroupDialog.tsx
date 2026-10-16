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
import { SettingSwitch } from "@/shared/ui/setting-controls";
import {
  DEFAULT_MENU_GROUP_ICON,
  type MenuGroup,
  type MenuIconName,
} from "@/entities/menu";
import { IconPicker } from "./IconPicker";

export type MenuGroupFormData = {
  title: string;
  icon: MenuIconName;
  internal: boolean;
};

type MenuGroupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: MenuGroup | null;
  onSubmit: (data: MenuGroupFormData) => void;
};

type MenuGroupFormProps = {
  group?: MenuGroup | null;
  onCancel: () => void;
  onSubmit: (data: MenuGroupFormData) => void;
};

function MenuGroupForm({ group, onCancel, onSubmit }: MenuGroupFormProps) {
  const isEdit = Boolean(group);
  const [title, setTitle] = useState(group?.title ?? "");
  const [icon, setIcon] = useState<MenuIconName>(
    group?.icon ?? DEFAULT_MENU_GROUP_ICON,
  );
  const [internal, setInternal] = useState(Boolean(group?.internal));
  const canSubmit = title.trim().length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Редактировать группу" : "Новая группа"}
        </DialogTitle>
        <DialogDescription>
          Название и иконка раскрываемой вкладки в боковом меню.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="menu-group-title">Название</Label>
          <Input
            id="menu-group-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Например, Система"
            autoFocus
          />
        </div>

        <SettingSwitch
          id="menu-group-internal"
          title="Служебное"
          description="Не показывать группу в боковом меню"
          checked={internal}
          onCheckedChange={setInternal}
        />

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
            onSubmit({ title: title.trim(), icon, internal });
            onCancel();
          }}
        >
          {isEdit ? "Сохранить" : "Добавить"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function MenuGroupDialog({
  open,
  onOpenChange,
  group,
  onSubmit,
}: MenuGroupDialogProps) {
  const formKey = group?.id ?? "new-group";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <MenuGroupForm
            key={formKey}
            group={group}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
