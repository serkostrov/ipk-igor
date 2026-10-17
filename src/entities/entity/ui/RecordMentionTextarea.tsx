import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/shared/lib/cn";
import { Textarea } from "@/shared/ui/textarea";
import { getPersonInitials } from "@/shared/lib/person";
import {
  applyMentionInsertion,
  filterMentionableUsers,
  findActiveMentionQuery,
  listMentionableUsers,
  type MentionableUser,
} from "../lib/record-mentions";
import type { Entity } from "../model/types";

type RecordMentionTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  entities: readonly Entity[];
};

/**
 * Textarea with `@имя` autocomplete against system users.
 * Pick from the list to insert a stable full-name mention.
 */
export function RecordMentionTextarea({
  value,
  onChange,
  entities,
  className,
  onKeyDown,
  ...rest
}: RecordMentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const users = useMemo(() => listMentionableUsers(entities), [entities]);
  const active = useMemo(
    () => findActiveMentionQuery(value, caret),
    [value, caret],
  );
  const suggestions = useMemo(
    () =>
      active ? filterMentionableUsers(users, active.query).slice(0, 8) : [],
    [active, users],
  );
  const open = suggestions.length > 0;
  const highlightIndex =
    suggestions.length === 0 ? 0 : activeIndex % suggestions.length;

  function syncCaret() {
    const node = textareaRef.current;
    if (!node) return;
    setCaret(node.selectionStart ?? 0);
  }

  function pick(user: MentionableUser) {
    if (!active) return;
    const next = applyMentionInsertion(value, caret, active.start, user.name);
    onChange(next.text);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(
          (index) => (index - 1 + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
        const selected = suggestions[highlightIndex];
        if (selected) {
          event.preventDefault();
          pick(selected);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCaret(active?.start ?? caret);
        return;
      }
      if (event.key === "Tab") {
        const selected = suggestions[highlightIndex];
        if (selected) {
          event.preventDefault();
          pick(selected);
          return;
        }
      }
    }
    onKeyDown?.(event);
  }

  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={textareaRef}
        value={value}
        className={cn(className)}
        onChange={(event) => {
          onChange(event.target.value);
          setCaret(event.target.selectionStart ?? event.target.value.length);
          setActiveIndex(0);
        }}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onSelect={syncCaret}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <ul
          role="listbox"
          aria-label="Упомянуть пользователя"
          className="absolute bottom-full left-0 z-50 mb-1 max-h-56 w-full min-w-[14rem] overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {suggestions.map((user, index) => (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlightIndex}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                  index === highlightIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(user);
                }}
              >
                <span
                  aria-hidden
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
                >
                  {getPersonInitials(user.name)}
                </span>
                <span className="truncate">@{user.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
