import { useEffect, useMemo, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { MenuSettings } from "@/features/customize-menu";
import { EntitySettings } from "@/features/manage-entities";
import { AutomationSettings } from "@/features/manage-automations";
import { NotificationSettings } from "@/features/manage-notifications";
import { RoleSettings } from "@/features/manage-roles";
import {
  SETTINGS_TAB_IDS,
  useCanAccessSettings,
  useCanSettingsTab,
  type SettingsTabId,
} from "@/entities/access";
import {
  settingsLocation,
  useAppLocation,
  useAppNavigate,
  type SettingsPathTab,
} from "@/shared/lib/navigation";

function SettingsTabsList({ tabs }: { tabs: SettingsTabId[] }) {
  return (
    <TabsList variant="line">
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
  const activeTab = locationTab ?? tabs[0] ?? null;

  useEffect(() => {
    if (location.type !== "settings" || !activeTab) return;
    if (location.tab === activeTab) return;
    if (location.tab && tabs.includes(location.tab as SettingsTabId)) return;
    replace(settingsLocation({ tab: activeTab as SettingsPathTab }));
  }, [location, activeTab, tabs, replace]);

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
    go(
      settingsLocation({
        tab: tab as SettingsPathTab,
        entityId:
          tab === "entities" && location.type === "settings"
            ? location.entityId
            : undefined,
        entityTabId:
          tab === "entities" && location.type === "settings"
            ? location.entityTabId
            : undefined,
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
              <SettingsTabsList tabs={tabs} />
              <div className="mt-5">
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
                selectedEntityId={
                  location.type === "settings" && location.tab === "entities"
                    ? location.entityId
                    : undefined
                }
                selectedEntityTabId={
                  location.type === "settings" && location.tab === "entities"
                    ? location.entityTabId
                    : undefined
                }
                onSelectedEntityIdChange={(entityId) => {
                  // Only sync while «Сущности» is active — otherwise a still-
                  // mounted panel bounces the URL back from Меню/…
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
