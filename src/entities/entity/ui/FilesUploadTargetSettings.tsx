import { useMemo, type ReactNode } from "react";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { SettingSwitch } from "@/shared/ui/setting-controls";
import {
  isEntityFilesTab,
  type Entity,
  type EntityFilesUploadTarget,
} from "../model/types";

const UPLOAD_ROOT_VALUE = "__root__";

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {title}
      </Label>
      {children}
    </div>
  );
}

function SwitchRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
      {children}
    </div>
  );
}

function ReadOnlyValue({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground">
      {children}
    </p>
  );
}

export type FilesUploadTargetSettingsProps = {
  entity: Entity;
  value: EntityFilesUploadTarget | null;
  onChange: (next: EntityFilesUploadTarget | null) => void;
  readOnly?: boolean;
  /** Switch id prefix to keep unique when multiple instances exist. */
  idPrefix?: string;
  enableTitle: string;
  enableDescription?: string;
  enableDescriptionEmpty?: string;
  requiredTitle: string;
  requiredDescription?: string;
  footerHint?: ReactNode;
};

export function FilesUploadTargetSettings({
  entity,
  value,
  onChange,
  readOnly = false,
  idPrefix = "files-upload-target",
  enableTitle,
  enableDescription,
  enableDescriptionEmpty = "Нужна вкладка «Файлы» у сущности",
  requiredTitle,
  requiredDescription,
  footerHint,
}: FilesUploadTargetSettingsProps) {
  const filesTabs = useMemo(
    () => entity.tabs.filter((tab) => isEntityFilesTab(tab)),
    [entity.tabs],
  );
  const enabled = value != null;
  const activeTab =
    filesTabs.find((tab) => tab.id === value?.filesTabId) ?? filesTabs[0];
  const folderOptions = activeTab?.defaultFolders ?? [];
  const folderLabel = value?.folderId.trim()
    ? (folderOptions.find((item) => item.id === value.folderId)?.name ??
      "Папка")
    : "Без папки (корень)";

  function enableUpload(checked: boolean) {
    if (!checked) {
      onChange(null);
      return;
    }
    const tab = activeTab ?? filesTabs[0];
    if (!tab) return;
    onChange({
      filesTabId: tab.id,
      folderId: tab.defaultFolders[0]?.id ?? "",
      required: true,
    });
  }

  function patchTarget(next: EntityFilesUploadTarget) {
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <SwitchRow>
        <SettingSwitch
          id={`${idPrefix}-enable`}
          title={enableTitle}
          description={
            filesTabs.length === 0 ? enableDescriptionEmpty : enableDescription
          }
          checked={enabled}
          readOnly={readOnly}
          disabled={filesTabs.length === 0}
          onCheckedChange={enableUpload}
        />
      </SwitchRow>

      {enabled && activeTab && value ? (
        <div className="flex flex-col gap-3">
          {filesTabs.length > 1 ? (
            <Field title="Вкладка файлов">
              {readOnly ? (
                <ReadOnlyValue>{activeTab.name}</ReadOnlyValue>
              ) : (
                <Select
                  value={activeTab.id}
                  onValueChange={(next) => {
                    if (next == null) return;
                    const tabId = String(next);
                    const tab = filesTabs.find((item) => item.id === tabId);
                    if (!tab) return;
                    patchTarget({
                      ...value,
                      filesTabId: tab.id,
                      folderId: tab.defaultFolders[0]?.id ?? "",
                    });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{activeTab.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {filesTabs.map((tab) => (
                      <SelectItem key={tab.id} value={tab.id}>
                        {tab.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}

          <Field title="Папка">
            {readOnly ? (
              <ReadOnlyValue>
                <span className="flex items-center gap-2">
                  {value.folderId.trim() ? (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          folderOptions.find(
                            (item) => item.id === value.folderId,
                          )?.color ?? "currentColor",
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {folderLabel}
                </span>
              </ReadOnlyValue>
            ) : (
              <Select
                value={
                  value.folderId.trim() ? value.folderId : UPLOAD_ROOT_VALUE
                }
                onValueChange={(next) => {
                  if (next == null) return;
                  const selected = String(next);
                  patchTarget({
                    ...value,
                    folderId: selected === UPLOAD_ROOT_VALUE ? "" : selected,
                  });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{folderLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UPLOAD_ROOT_VALUE}>
                    Без папки (корень)
                  </SelectItem>
                  {folderOptions.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: folder.color }}
                          aria-hidden
                        />
                        {folder.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <SwitchRow>
            <SettingSwitch
              id={`${idPrefix}-required`}
              title={requiredTitle}
              description={requiredDescription}
              checked={value.required === true}
              readOnly={readOnly}
              onCheckedChange={(required) => {
                patchTarget({ ...value, required });
              }}
            />
          </SwitchRow>

          {footerHint && !readOnly ? (
            <div className="text-[11px] leading-snug text-muted-foreground">
              {footerHint}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
