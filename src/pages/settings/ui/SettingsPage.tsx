import { useEffect, useMemo, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { MenuSettings } from "@/features/customize-menu";
import { EntitySettings } from "@/features/manage-entities";
import { AutomationSettings } from "@/features/manage-automations";
import { NotificationSettings } from "@/features/manage-notifications";
import { RoleSettings } from "@/features/manage-roles";
import {
  SETTINGS_TAB_IDS,
  isSettingsTabId,
  useCanAccessSettings,
  useCanSettingsTab,
  type SettingsTabId,
} from "@/entities/access";
import { useLocalStorageState } from "@/shared/hooks/use-local-storage-state";
import {
  settingsLocation,
  useAppLocation,
  useAppNavigate,
  type SettingsPathTab,
} from "@/shared/lib/navigation";

const SETTINGS_TAB_KEY = "settings.selectedTab";
const SETTINGS_ENTITY_ID_KEY = "settings.entities.selectedEntityId";
const SETTINGS_ENTITY_TAB_ID_KEY = "settings.entities.selectedEntityTabId";

function parseStoredId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseStoredSettingsTab(value: unknown): SettingsTabId | null {
  return typeof value === "string" && isSettingsTabId(value) ? value : null;
}

function SettingsTabsList({ tabs }: { tabs: SettingsTabId[] }) {
  return (
    <div className="min-w-0 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <TabsList variant="line" className="w-max max-w-none">
        {tabs.includes("menu") ? (
          <TabsTrigger value="menu">Меню</TabsTrigger>
        ) : null}
        {tabs.includes("entities") ? (
          <TabsTrigger value="entities">Сущности</TabsTrigger>
        ) : null}
        {tabs.includes("automations") ? (
          <TabsTrigger value="automations">Автоматизации</TabsTrigger>
        ) : null}
        {tabs.includes("notifications") ? (
          <TabsTrigger value="notifications">Уведомления</TabsTrigger>
        ) : null}
        {tabs.includes("roles") ? (
          <TabsTrigger value="roles">Роли</TabsTrigger>
        ) : null}
      </TabsList>
    </div>
  );
}

/** Sticky tabs strip for tabs that render the list above content (e.g. Меню). */
function SettingsTabsSticky({ tabs }: { tabs: SettingsTabId[] }) {
  return (
    <div className="sticky top-0 z-20 -mx-1 bg-background px-1 pb-3">
      <SettingsTabsList tabs={tabs} />
    </div>
  );
}

function SettingsTabPanel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-0 flex min-h-0 flex-1 flex-col outline-none">
      {children}
    </div>
  );
}

type SettingsPageProps = {
  onOpenEntity?: (entityId: string) => void;
};

export function SettingsPage({ onOpenEntity }: SettingsPageProps) {
  const location = useAppLocation();
  const { go, replace } = useAppNavigate();
  const canAccess = useCanAccessSettings();
  const canMenu = useCanSettingsTab("menu");
  const canEntities = useCanSettingsTab("entities");
  const canAutomations = useCanSettingsTab("automations");
  const canNotifications = useCanSettingsTab("notifications");
  const canRoles = useCanSettingsTab("roles");
  const [storedTab, setStoredTab] = useLocalStorageState(
    SETTINGS_TAB_KEY,
    parseStoredSettingsTab,
    null,
  );
  const [storedEntityId, setStoredEntityId] = useLocalStorageState(
    SETTINGS_ENTITY_ID_KEY,
    parseStoredId,
    null,
  );
  const [storedEntityTabId, setStoredEntityTabId] = useLocalStorageState(
    SETTINGS_ENTITY_TAB_ID_KEY,
    parseStoredId,
    null,
  );

  const tabs = useMemo(() => {
    return SETTINGS_TAB_IDS.filter((tab) => {
      if (tab === "menu") return canMenu;
      if (tab === "entities") return canEntities;
      if (tab === "automations") return canAutomations;
      if (tab === "notifications") return canNotifications;
      if (tab === "roles") return canRoles;
      return false;
    });
  }, [canMenu, canEntities, canAutomations, canNotifications, canRoles]);

  const locationTab =
    location.type === "settings" &&
    location.tab &&
    tabs.includes(location.tab as SettingsTabId)
      ? (location.tab as SettingsTabId)
      : null;
  const restoredTab = storedTab && tabs.includes(storedTab) ? storedTab : null;
  const activeTab = locationTab ?? restoredTab ?? tabs[0] ?? null;

  const urlEntityId =
    location.type === "settings" && location.tab === "entities"
      ? (location.entityId ?? null)
      : null;
  const urlEntityTabId =
    location.type === "settings" && location.tab === "entities"
      ? (location.entityTabId ?? null)
      : null;
  /** Keep selection across tabs / navigation — URL when present, else storage. */
  const selectedEntityId = urlEntityId ?? storedEntityId;
  const selectedEntityTabId =
    urlEntityId && urlEntityId === selectedEntityId
      ? (urlEntityTabId ?? storedEntityTabId)
      : selectedEntityId === storedEntityId
        ? storedEntityTabId
        : null;

  useEffect(() => {
    if (location.type !== "settings" || !activeTab) return;
    if (location.tab === activeTab) return;
    if (location.tab && tabs.includes(location.tab as SettingsTabId)) return;
    replace(
      settingsLocation({
        tab: activeTab as SettingsPathTab,
        entityId:
          activeTab === "entities" ? (storedEntityId ?? undefined) : undefined,
        entityTabId:
          activeTab === "entities"
            ? (storedEntityTabId ?? undefined)
            : undefined,
      }),
    );
  }, [location, activeTab, tabs, replace, storedEntityId, storedEntityTabId]);

  // Remember last settings tab / entity for restore after leaving settings.
  useEffect(() => {
    if (location.type !== "settings") return;
    if (location.tab && tabs.includes(location.tab as SettingsTabId)) {
      setStoredTab(location.tab as SettingsTabId);
    }
    if (location.tab === "entities") {
      if (location.entityId) setStoredEntityId(location.entityId);
      if (location.entityTabId) setStoredEntityTabId(location.entityTabId);
    }
  }, [location, tabs, setStoredTab, setStoredEntityId, setStoredEntityTabId]);

  if (!canAccess || tabs.length === 0 || !activeTab) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Недостаточно прав для просмотра настроек.
        </p>
      </div>
    );
  }

  function selectTab(tab: SettingsTabId) {
    setStoredTab(tab);
    go(
      settingsLocation({
        tab: tab as SettingsPathTab,
        entityId:
          tab === "entities" ? (selectedEntityId ?? undefined) : undefined,
        entityTabId:
          tab === "entities" ? (selectedEntityTabId ?? undefined) : undefined,
      }),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-8">
      <div className="flex shrink-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (SETTINGS_TAB_IDS.includes(value as SettingsTabId)) {
            selectTab(value as SettingsTabId);
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {canMenu ? (
          <TabsContent
            value="menu"
            className="mt-0 min-h-0 flex-1 overflow-auto"
          >
            <SettingsTabPanel>
              <SettingsTabsSticky tabs={tabs} />
              <div className="mt-2">
                <MenuSettings />
              </div>
            </SettingsTabPanel>
          </TabsContent>
        ) : null}

        {canEntities ? (
          <TabsContent
            value="entities"
            className="mt-0 min-h-0 flex-1 overflow-auto"
          >
            <SettingsTabPanel>
              <EntitySettings
                leading={<SettingsTabsList tabs={tabs} />}
                onOpenEntity={onOpenEntity}
                selectedEntityId={selectedEntityId}
                selectedEntityTabId={selectedEntityTabId}
                onSelectedEntityIdChange={(entityId) => {
                  setStoredEntityId(entityId);
                  setStoredEntityTabId(null);
                  // Only sync URL while «Сущности» is active — otherwise a
                  // still-mounted panel bounces navigation from Меню/…
                  if (
                    location.type !== "settings" ||
                    location.tab !== "entities"
                  ) {
                    return;
                  }
                  const next = settingsLocation({
                    tab: "entities",
                    entityId,
                  });
                  if (location.entityId) {
                    go(next);
                  } else {
                    replace(next);
                  }
                }}
                onSelectedEntityTabIdChange={(entityId, entityTabId) => {
                  setStoredEntityId(entityId);
                  setStoredEntityTabId(entityTabId);
                  if (
                    location.type !== "settings" ||
                    location.tab !== "entities"
                  ) {
                    return;
                  }
                  go(
                    settingsLocation({
                      tab: "entities",
                      entityId,
                      entityTabId,
                    }),
                  );
                }}
              />
            </SettingsTabPanel>
          </TabsContent>
        ) : null}

        {canAutomations ? (
          <TabsContent
            value="automations"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <SettingsTabPanel>
              <AutomationSettings leading={<SettingsTabsList tabs={tabs} />} />
            </SettingsTabPanel>
          </TabsContent>
        ) : null}

        {canNotifications ? (
          <TabsContent
            value="notifications"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <SettingsTabPanel>
              <NotificationSettings
                leading={<SettingsTabsList tabs={tabs} />}
              />
            </SettingsTabPanel>
          </TabsContent>
        ) : null}

        {canRoles ? (
          <TabsContent
            value="roles"
            className="mt-0 min-h-0 flex-1 overflow-auto"
          >
            <SettingsTabPanel>
              <RoleSettings leading={<SettingsTabsList tabs={tabs} />} />
            </SettingsTabPanel>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
