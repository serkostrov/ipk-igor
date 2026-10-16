import { useEffect, useRef, useState } from "react";
import { Braces } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { getEntityFieldDisplayName, type EntityField } from "@/entities/entity";
import { cn } from "@/shared/lib/cn";
import {
  getTemplateFieldLabel,
  parseTemplateParts,
  serializeTemplateParts,
  type TemplatePart,
} from "../lib/template-text";
import { TemplateFieldToken } from "./TemplateRichText";

function ensureTrailingText(parts: TemplatePart[]): TemplatePart[] {
  if (parts.length === 0 || parts[parts.length - 1]?.kind === "field") {
    return [...parts, { kind: "text", text: "" }];
  }
  return parts;
}

function textInputWidth(text: string, emptyMin = 1) {
  return `${Math.max(emptyMin, text.length + 1)}ch`;
}

export function TemplateFieldInput({
  title,
  value,
  onChange,
  fields,
  placeholder,
  id,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  fields: EntityField[];
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const parts = ensureTrailingText(parseTemplateParts(value));
  const activeTextIndexRef = useRef(0);
  const caretRef = useRef(0);
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const focusAfterRenderRef = useRef<{ index: number; caret: number } | null>(
    null,
  );

  useEffect(() => {
    const pending = focusAfterRenderRef.current;
    if (!pending) return;
    focusAfterRenderRef.current = null;
    const node = inputRefs.current.get(pending.index);
    if (!node) return;
    node.focus();
    node.setSelectionRange(pending.caret, pending.caret);
  }, [value]);

  function commit(nextParts: TemplatePart[]) {
    onChange(
      serializeTemplateParts(
        ensureTrailingText(
          parseTemplateParts(serializeTemplateParts(nextParts)),
        ),
      ),
    );
  }

  function updateText(index: number, text: string) {
    commit(
      parts.map((part, i) =>
        i === index && part.kind === "text"
          ? { kind: "text" as const, text }
          : part,
      ),
    );
  }

  function removeField(index: number) {
    const next = parts.filter((_, i) => i !== index);
    const focusIndex = Math.max(0, index - 1);
    const focusPart = next[focusIndex];
    const caret = focusPart?.kind === "text" ? focusPart.text.length : 0;
    focusAfterRenderRef.current = { index: focusIndex, caret };
    commit(next);
  }

  function insertField(field: EntityField) {
    const index = activeTextIndexRef.current;
    const part = parts[index];
    if (!part || part.kind !== "text") {
      const next = [
        ...parts,
        { kind: "field" as const, id: field.id },
        { kind: "text" as const, text: "" },
      ];
      focusAfterRenderRef.current = { index: next.length - 1, caret: 0 };
      commit(next);
      setOpen(false);
      return;
    }

    const caret = caretRef.current;
    const before = part.text.slice(0, caret);
    const after = part.text.slice(caret);
    const next = [
      ...parts.slice(0, index),
      { kind: "text" as const, text: before },
      { kind: "field" as const, id: field.id },
      { kind: "text" as const, text: after },
      ...parts.slice(index + 1),
    ];
    focusAfterRenderRef.current = { index: index + 2, caret: 0 };
    commit(next);
    setOpen(false);
  }

  const showPlaceholder =
    Boolean(placeholder) &&
    parts.length === 1 &&
    parts[0]?.kind === "text" &&
    parts[0].text === "";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex h-5 items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-medium text-foreground">
          {title}
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Вставить поле"
                title="Вставить поле"
              />
            }
          >
            <Braces className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-64 gap-0 overflow-hidden p-1"
          >
            <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
              Поле записи
            </p>
            <div className="max-h-56 overflow-y-auto">
              {fields.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Нет полей
                </p>
              ) : (
                fields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/70"
                    onClick={() => insertField(field)}
                  >
                    <span className="truncate">
                      {getEntityFieldDisplayName(field)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div
        className={cn(
          "relative flex min-h-8 w-full min-w-0 flex-wrap items-center gap-x-0.5 gap-y-0.5 rounded-md border border-input bg-transparent px-2 py-1 shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          "dark:bg-input/30",
        )}
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const lastTextIndex = [...parts]
            .map((part, index) => ({ part, index }))
            .reverse()
            .find((item) => item.part.kind === "text")?.index;
          if (lastTextIndex == null) return;
          event.preventDefault();
          const node = inputRefs.current.get(lastTextIndex);
          node?.focus();
        }}
      >
        {showPlaceholder ? (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {placeholder}
          </span>
        ) : null}

        {parts.map((part, index) => {
          if (part.kind === "field") {
            return (
              <TemplateFieldToken
                key={`field-${index}-${part.id}`}
                label={getTemplateFieldLabel(fields, part.id)}
                onRemove={() => removeField(index)}
              />
            );
          }

          const isLast = index === parts.length - 1;

          return (
            <input
              key={`text-${index}`}
              ref={(node) => {
                if (node) inputRefs.current.set(index, node);
                else inputRefs.current.delete(index);
              }}
              id={index === 0 ? id : undefined}
              value={part.text}
              className={cn(
                "min-w-[1ch] border-0 bg-transparent py-0 text-sm leading-5 outline-none",
                isLast && "min-w-[3ch] flex-1",
              )}
              style={
                isLast ? undefined : { width: textInputWidth(part.text, 1) }
              }
              onFocus={(event) => {
                activeTextIndexRef.current = index;
                caretRef.current = event.currentTarget.selectionStart ?? 0;
              }}
              onSelect={(event) => {
                activeTextIndexRef.current = index;
                caretRef.current = event.currentTarget.selectionStart ?? 0;
              }}
              onClick={(event) => {
                activeTextIndexRef.current = index;
                caretRef.current = event.currentTarget.selectionStart ?? 0;
              }}
              onKeyUp={(event) => {
                caretRef.current = event.currentTarget.selectionStart ?? 0;
              }}
              onChange={(event) => {
                caretRef.current = event.currentTarget.selectionStart ?? 0;
                activeTextIndexRef.current = index;
                updateText(index, event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Backspace") return;
                if (part.text !== "") return;
                if (index === 0) return;
                const prev = parts[index - 1];
                if (prev?.kind !== "field") return;
                event.preventDefault();
                removeField(index - 1);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
