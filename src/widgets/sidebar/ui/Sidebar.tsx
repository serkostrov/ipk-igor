import { createElement, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/shared/ui/button";
import { TreeBranchRow } from "@/shared/ui/tree-branch-guides";
import { cn } from "@/shared/lib/cn";
import { getPersonInitials } from "@/shared/lib/person";
import { RunningTimerCard } from "./RunningTimerCard";
import {
  SYSTEM_USERS_ENTITY_ID,
  SYSTEM_USERS_FIELD_EMAIL_ID,
  SYSTEM_USERS_FIELD_NAME_ID,
  isEntityInternal,
  useEntityConfig,
  useEntityStatus,
} from "@/entities/entity";
import {
  AUTOMATION_TASKS_ITEM_ID,
  NOTIFICATIONS_ITEM_ID,
  filterVisibleMenuEntries,
  flattenMenuEntriesToItems,
  flattenMenuGroupItems,
  flattenMenuSubtreeItems,
  getMenuIcon,
  isEntityLinkedMenuItem,
  useMenuConfig,
  useMenuStatus,
  type MenuEntry,
  type MenuGroupEntry,
  type MenuIconName,
  type MenuItemEntry,
} from "@/entities/menu";
import { canMenuItem, roleMenuFlat, useCurrentRole } from "@/entities/access";
import { signOut, useSessionUser } from "@/entities/session";
import { NotificationBell } from "@/features/notification-inbox";
import { SidebarNavSkeleton } from "./SidebarNavSkeleton";

function SidebarMenuIcon({
  name,
  className,
}: {
  name: MenuIconName;
  className?: string;
}) {
  return createElement(getMenuIcon(name), {
    className,
    "aria-hidden": true,
  });
}

type SidebarProps = {
  activeId?: string;
  onNavigate?: (id: string) => void;
  /** Opens a record (running timer card). */
  onOpenRecord?: (entityId: string, recordId: string) => void;
  className?: string;
};

const groupRevealTransition = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1] as const,
};

function navItemClass({
  collapsed,
  isActive,
}: {
  collapsed: boolean;
  isActive: boolean;
}) {
  return cn(
    "h-auto w-full min-w-0 shrink transition-colors duration-150",
    "aria-expanded:bg-transparent aria-expanded:text-sidebar-foreground/70",
    "aria-expanded:hover:bg-sidebar-accent/70 aria-expanded:hover:text-sidebar-foreground",
    collapsed
      ? "flex-col gap-1 overflow-hidden px-1 py-2"
      : "justify-start gap-2.5 px-3 py-2",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      : "bg-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
  );
}

function NavLabel({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "min-w-0 truncate",
        collapsed
          ? "w-full max-w-full text-center text-[8px] leading-tight"
          : "flex-1 text-left text-sm",
      )}
    >
      {children}
    </span>
  );
}

function SidebarTreeRow({
  isFirst = false,
  isLast = false,
  children,
}: {
  isFirst?: boolean;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <TreeBranchRow
      isFirst={isFirst}
      isLast={isLast}
      tone="sidebar"
      insetClassName="ml-4"
      contentClassName="pl-3.5"
    >
      {children}
    </TreeBranchRow>
  );
}

type SidebarTreeProps = {
  collapsed: boolean;
  activeId: string;
  collapsedGroupIds: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onNavigate?: (id: string) => void;
  pathLabel?: string;
  nested?: boolean;
};

function renderNestedEntries({
  entries,
  activeId,
  collapsedGroupIds,
  onToggleGroup,
  onNavigate,
  pathLabel,
}: {
  entries: MenuEntry[];
  activeId: string;
  collapsedGroupIds: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onNavigate?: (id: string) => void;
  pathLabel?: string;
}) {
  return entries.map((entry, entryIndex) => {
    const isFirst = entryIndex === 0;
    const isLast = entryIndex === entries.length - 1;
    return (
      <SidebarTreeRow key={entry.id} isFirst={isFirst} isLast={isLast}>
        <div className="min-w-0 flex-1">
          {entry.type === "item" ? (
            entry.entries?.length ? (
              <SidebarItemFolder
                item={entry}
                collapsed={false}
                activeId={activeId}
                collapsedGroupIds={collapsedGroupIds}
                onToggleGroup={onToggleGroup}
                onNavigate={onNavigate}
                pathLabel={pathLabel}
                nested
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                aria-current={entry.id === activeId ? "page" : undefined}
                onClick={() => onNavigate?.(entry.id)}
                className={cn(
                  navItemClass({
                    collapsed: false,
                    isActive: entry.id === activeId,
                  }),
                  "h-9 min-w-0 w-full px-2 py-0",
                )}
              >
                <SidebarMenuIcon
                  name={entry.icon}
                  className="size-4 shrink-0"
                />
                <span className="truncate text-sm">{entry.label}</span>
              </Button>
            )
          ) : (
            <SidebarGroupTree
              group={entry}
              collapsed={false}
              activeId={activeId}
              collapsedGroupIds={collapsedGroupIds}
              onToggleGroup={onToggleGroup}
              onNavigate={onNavigate}
              pathLabel={pathLabel}
              nested
            />
          )}
        </div>
      </SidebarTreeRow>
    );
  });
}

function SidebarCollapsedLeaves({
  leaves,
  activeId,
  pathLabel,
  onNavigate,
}: {
  leaves: Array<{ id: string; label: string; icon: MenuIconName }>;
  activeId: string;
  pathLabel: string;
  onNavigate?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <span
        aria-hidden
        className="mx-auto block h-2 w-px bg-sidebar-foreground/30"
      />
      {leaves.map((item) => {
        const isActive = item.id === activeId;
        return (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            aria-current={isActive ? "page" : undefined}
            title={`${pathLabel} → ${item.label}`}
            onClick={() => onNavigate?.(item.id)}
            className={cn(
              navItemClass({
                collapsed: true,
                isActive,
              }),
              "rounded-md",
            )}
          >
            <SidebarMenuIcon name={item.icon} className="size-4 shrink-0" />
            <NavLabel collapsed>{item.label}</NavLabel>
          </Button>
        );
      })}
    </div>
  );
}

function SidebarItemFolder({
  item,
  collapsed,
  activeId,
  collapsedGroupIds,
  onToggleGroup,
  onNavigate,
  pathLabel,
  nested = false,
}: SidebarTreeProps & { item: MenuItemEntry }) {
  const childEntries = item.entries ?? [];
  const isExpanded = !collapsedGroupIds.has(item.id);
  const isActive = item.id === activeId;
  const leafItems = flattenMenuSubtreeItems(childEntries);
  const showCollapsedCluster = collapsed && isExpanded && leafItems.length > 0;
  const titlePath = pathLabel ? `${pathLabel} → ${item.label}` : item.label;

  return (
    <div
      className={cn(
        "flex flex-col",
        showCollapsedCluster &&
          "overflow-hidden rounded-md border border-sidebar-border/70 bg-transparent p-0.5",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-0.5",
          nested && !collapsed && "h-9",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          aria-current={isActive ? "page" : undefined}
          title={item.label}
          onClick={() => onNavigate?.(item.id)}
          className={cn(
            navItemClass({
              collapsed,
              isActive,
            }),
            "min-w-0 flex-1",
            nested && !collapsed && "h-9 px-2 py-0",
            showCollapsedCluster &&
              "rounded-md py-1.5 hover:bg-sidebar-accent/35",
          )}
        >
          <SidebarMenuIcon name={item.icon} className="size-4 shrink-0" />
          <NavLabel collapsed={collapsed}>{item.label}</NavLabel>
        </Button>
        {!collapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Свернуть" : "Развернуть"}
            title={isExpanded ? "Свернуть" : "Развернуть"}
            onClick={() => onToggleGroup(item.id)}
            className="size-8 shrink-0 text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-200",
                isExpanded && "rotate-180",
              )}
              aria-hidden
            />
          </Button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key={`${item.id}-entries`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={groupRevealTransition}
            className="overflow-hidden"
          >
            {collapsed ? (
              <SidebarCollapsedLeaves
                leaves={leafItems}
                activeId={activeId}
                pathLabel={titlePath}
                onNavigate={onNavigate}
              />
            ) : (
              <div className="flex flex-col">
                {renderNestedEntries({
                  entries: childEntries,
                  activeId,
                  collapsedGroupIds,
                  onToggleGroup,
                  onNavigate,
                  pathLabel: titlePath,
                })}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SidebarGroupTree({
  group,
  collapsed,
  activeId,
  collapsedGroupIds,
  onToggleGroup,
  onNavigate,
  pathLabel,
  nested = false,
}: SidebarTreeProps & { group: MenuGroupEntry }) {
  const isExpanded = !collapsedGroupIds.has(group.id);
  const leafItems = flattenMenuGroupItems(group);
  const showCollapsedCluster = collapsed && isExpanded && leafItems.length > 0;
  const titlePath = pathLabel ? `${pathLabel} → ${group.title}` : group.title;

  return (
    <div
      className={cn(
        "flex flex-col",
        showCollapsedCluster &&
          "overflow-hidden rounded-md border border-sidebar-border/70 bg-transparent p-0.5",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        aria-expanded={isExpanded}
        title={group.title}
        onClick={() => onToggleGroup(group.id)}
        className={cn(
          navItemClass({
            collapsed,
            isActive: false,
          }),
          nested && !collapsed && "h-9 px-2 py-0",
          showCollapsedCluster &&
            "rounded-md py-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent/35 hover:text-sidebar-foreground/80",
        )}
      >
        <SidebarMenuIcon name={group.icon} className="size-4 shrink-0" />
        <NavLabel collapsed={collapsed}>{group.title}</NavLabel>
        {!collapsed ? (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform duration-200",
              isExpanded && "rotate-180",
            )}
            aria-hidden
          />
        ) : null}
      </Button>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key={`${group.id}-entries`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={groupRevealTransition}
            className="overflow-hidden"
          >
            {collapsed ? (
              <SidebarCollapsedLeaves
                leaves={leafItems}
                activeId={activeId}
                pathLabel={titlePath}
                onNavigate={onNavigate}
              />
            ) : (
              <div className="flex flex-col">
                {renderNestedEntries({
                  entries: group.entries,
                  activeId,
                  collapsedGroupIds,
                  onToggleGroup,
                  onNavigate,
                  pathLabel: titlePath,
                })}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function renderSidebarEntries({
  entries,
  collapsed,
  activeId,
  collapsedGroupIds,
  onToggleGroup,
  onNavigate,
}: {
  entries: MenuEntry[];
  collapsed: boolean;
  activeId: string;
  collapsedGroupIds: Set<string>;
  onToggleGroup: (groupId: string) => void;
  onNavigate?: (id: string) => void;
}) {
  return entries.map((entry) => {
    if (entry.type === "item") {
      if (entry.entries?.length) {
        return (
          <SidebarItemFolder
            key={entry.id}
            item={entry}
            collapsed={collapsed}
            activeId={activeId}
            collapsedGroupIds={collapsedGroupIds}
            onToggleGroup={onToggleGroup}
            onNavigate={onNavigate}
          />
        );
      }
      const isActive = entry.id === activeId;
      return (
        <Button
          key={entry.id}
          type="button"
          variant="ghost"
          aria-current={isActive ? "page" : undefined}
          title={entry.label}
          onClick={() => onNavigate?.(entry.id)}
          className={navItemClass({ collapsed, isActive })}
        >
          <SidebarMenuIcon name={entry.icon} className="size-4 shrink-0" />
          <NavLabel collapsed={collapsed}>{entry.label}</NavLabel>
        </Button>
      );
    }

    return (
      <SidebarGroupTree
        key={entry.id}
        group={entry}
        collapsed={collapsed}
        activeId={activeId}
        collapsedGroupIds={collapsedGroupIds}
        onToggleGroup={onToggleGroup}
        onNavigate={onNavigate}
      />
    );
  });
}

function SidebarUserAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-semibold tracking-wide text-sidebar-accent-foreground ring-1 ring-sidebar-border/80"
    >
      {getPersonInitials(name)}
    </span>
  );
}

export function Sidebar({
  activeId = "settings",
  onNavigate,
  onOpenRecord,
  className,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const { entries } = useMenuConfig();
  const status = useMenuStatus();
  const entityStatus = useEntityStatus();
  // Wait for entities so internal (service) items are known before first paint.
  const isNavLoading =
    status === "idle" ||
    status === "loading" ||
    entityStatus === "idle" ||
    entityStatus === "loading";
  const sessionUser = useSessionUser();
  const { entities } = useEntityConfig();
  const role = useCurrentRole();

  const navEntries = useMemo(() => {
    const internalIds = new Set(
      entities.filter(isEntityInternal).map((entity) => entity.id),
    );
    const visible = filterVisibleMenuEntries(entries, (itemId) => {
      if (isEntityLinkedMenuItem(itemId) && internalIds.has(itemId)) {
        return true;
      }
      const entityId = isEntityLinkedMenuItem(itemId) ? itemId : null;
      return !canMenuItem(role, itemId, entityId);
    });
    return roleMenuFlat(role) ? flattenMenuEntriesToItems(visible) : visible;
  }, [entries, entities, role]);

  const currentUser = useMemo(() => {
    const usersEntity = entities.find(
      (entity) => entity.id === SYSTEM_USERS_ENTITY_ID,
    );
    const profile = sessionUser
      ? (usersEntity?.records.find(
          (record) => record.authUserId === sessionUser.id,
        ) ?? null)
      : null;
    const profileName = profile?.values[SYSTEM_USERS_FIELD_NAME_ID]?.trim();
    const profileEmail = profile?.values[SYSTEM_USERS_FIELD_EMAIL_ID]?.trim();
    const metaName =
      typeof sessionUser?.user_metadata?.full_name === "string"
        ? sessionUser.user_metadata.full_name.trim()
        : "";
    const email = profileEmail || sessionUser?.email?.trim() || "";
    const name =
      profileName ||
      metaName ||
      (email.includes("@") ? email.split("@")[0]! : email) ||
      "Пользователь";
    return { name, email };
  }, [entities, sessionUser]);

  function toggleGroup(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-20" : "w-60",
        className,
      )}
    >
      <div
        className={cn(
          "flex border-b border-sidebar-border p-3",
          collapsed ? "flex-col items-center gap-2" : "items-center gap-2",
        )}
      >
        <img
          src={collapsed ? "/logo-mini-light.png" : "/logo-light.png"}
          alt="Центр ИПК"
          className={cn(
            "object-contain",
            collapsed ? "h-8 w-auto" : "h-10 w-auto max-w-[9.5rem] min-w-0",
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className={cn(
            "shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-transparent aria-expanded:text-sidebar-foreground/70 aria-expanded:hover:bg-sidebar-accent aria-expanded:hover:text-sidebar-accent-foreground",
            !collapsed && "ml-auto",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden />
          ) : (
            <PanelLeftClose aria-hidden />
          )}
        </Button>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2"
        aria-label="Основная навигация"
      >
        {isNavLoading ? (
          <SidebarNavSkeleton collapsed={collapsed} />
        ) : (
          <div className="flex flex-col">
            {renderSidebarEntries({
              entries: navEntries,
              collapsed,
              activeId,
              collapsedGroupIds,
              onToggleGroup: toggleGroup,
              onNavigate,
            })}
          </div>
        )}
      </nav>

      <RunningTimerCard collapsed={collapsed} onOpenRecord={onOpenRecord} />

      <div className="border-t border-sidebar-border p-2">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <NotificationBell
              onOpenAll={() => onNavigate?.(NOTIFICATIONS_ITEM_ID)}
              onOpenRecord={onOpenRecord}
              onOpenTasks={() => onNavigate?.(AUTOMATION_TASKS_ITEM_ID)}
            />
            <SidebarUserAvatar name={currentUser.name} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                void signOut();
              }}
              aria-label="Выйти"
              title="Выйти"
              className="size-7 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-3.5" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex h-7 items-center gap-2 px-0.5">
            <SidebarUserAvatar name={currentUser.name} />
            <div className="flex min-w-0 flex-1 flex-col justify-center leading-none">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {currentUser.name}
              </p>
              {currentUser.email ? (
                <p className="mt-0.5 truncate text-[10px] text-sidebar-foreground/55">
                  {currentUser.email}
                </p>
              ) : null}
            </div>
            <NotificationBell
              onOpenAll={() => onNavigate?.(NOTIFICATIONS_ITEM_ID)}
              onOpenRecord={onOpenRecord}
              onOpenTasks={() => onNavigate?.(AUTOMATION_TASKS_ITEM_ID)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                void signOut();
              }}
              aria-label="Выйти"
              title="Выйти"
              className="size-7 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-3.5" aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
