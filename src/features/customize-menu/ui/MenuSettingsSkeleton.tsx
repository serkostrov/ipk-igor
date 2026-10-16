export function MenuSettingsSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Загрузка меню"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Навигационное меню</h2>
        <p className="text-muted-foreground text-sm">
          Структура бокового меню: группы и пункты навигации.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 20 }, (_, index) => (
            <div
              key={index}
              className="h-10 w-full animate-pulse rounded-md border border-dashed border-border bg-muted/40"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
