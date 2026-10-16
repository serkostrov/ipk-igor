import { cn } from "@/shared/lib/cn";

export function SidebarNavSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-hidden"
      aria-busy="true"
      aria-label="Загрузка меню"
    >
      {Array.from({ length: 20 }, (_, index) => (
        <div
          key={index}
          className={cn(
            "w-full shrink-0 animate-pulse rounded-md border border-transparent bg-sidebar-accent",
            collapsed ? "h-14" : "h-9",
          )}
        />
      ))}
    </div>
  );
}
