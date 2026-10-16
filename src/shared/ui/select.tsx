"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { cn } from "cn";
import {
  ChevronDownIcon,
  CheckIcon,
  ChevronUpIcon,
  SearchIcon,
} from "lucide-react";

const Select = SelectPrimitive.Root;

type SelectSearchContextValue = {
  query: string;
  setQuery: (value: string) => void;
  searchable: boolean;
};

const SelectSearchContext =
  React.createContext<SelectSearchContextValue | null>(null);

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(" ");
  if (React.isValidElement(node)) {
    const props = node.props as {
      children?: React.ReactNode;
      label?: unknown;
    };
    if (typeof props.label === "string" && props.label.trim()) {
      return props.label;
    }
    return collectText(props.children);
  }
  return "";
}

function matchesSearch(query: string, ...parts: Array<string | undefined>) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  const haystack = normalizeSearchText(parts.filter(Boolean).join(" "));
  return haystack.includes(needle);
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = false,
  searchable = true,
  searchPlaceholder = "Поиск…",
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  > & {
    /** Show a filter field at the top of the popup. Default: true. */
    searchable?: boolean;
    searchPlaceholder?: string;
  }) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!searchable) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchable]);

  const searchValue = React.useMemo(
    () => ({ query, setQuery, searchable }),
    [query, searchable],
  );

  return (
    <SelectSearchContext.Provider value={searchValue}>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          alignItemWithTrigger={alignItemWithTrigger}
          className="isolate z-50"
        >
          <SelectPrimitive.Popup
            data-slot="select-content"
            data-align-trigger={alignItemWithTrigger}
            className={cn(
              "relative isolate z-50 flex max-h-[min(20rem,var(--available-height))] w-max min-w-[max(var(--anchor-width),9rem)] max-w-[min(32rem,var(--available-width,calc(100vw-2rem)))] origin-(--transform-origin) flex-col overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              className,
            )}
            {...props}
          >
            {searchable ? (
              <div
                data-slot="select-search"
                className="sticky top-0 z-20 border-b border-border/70 bg-popover p-1.5"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    className="h-8 w-full rounded-md border border-input bg-transparent py-1 pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") return;
                      event.stopPropagation();
                    }}
                  />
                </div>
              </div>
            ) : null}
            <SelectScrollUpButton />
            <SelectPrimitive.List
              data-slot="select-list"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
            >
              {children}
              {searchable && query.trim() ? (
                <div
                  data-slot="select-empty"
                  className="hidden px-2 py-3 text-center text-sm text-muted-foreground [[data-slot=select-list]:not(:has([data-slot=select-item]))]:block"
                >
                  Ничего не найдено
                </div>
              ) : null}
            </SelectPrimitive.List>
            <SelectScrollDownButton />
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectSearchContext.Provider>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  trailing,
  label,
  ...props
}: SelectPrimitive.Item.Props & {
  /** Right-aligned icon; shifts left when the check indicator is shown. */
  trailing?: React.ReactNode;
}) {
  const search = React.useContext(SelectSearchContext);
  const text = label ?? collectText(children);
  const visible =
    !search?.searchable ||
    matchesSearch(search.query, text, String(props.value ?? ""));

  if (!visible) return null;

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      label={label ?? text}
      className={cn(
        "group/item relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        trailing && "data-selected:pr-14",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      {trailing ? (
        <span
          data-slot="select-item-trailing"
          className="pointer-events-none absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center text-foreground group-data-[selected]/item:right-8"
        >
          {trailing}
        </span>
      ) : null}
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute top-1/2 right-2 z-10 flex size-4 -translate-y-1/2 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none size-4 !text-primary" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
