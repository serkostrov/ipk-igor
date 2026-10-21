import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import { Braces } from "lucide-react";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
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

type TextControl = HTMLInputElement | HTMLTextAreaElement;

export function TemplateFieldInput({
  title,
  value,
  onChange,
  fields,
  placeholder,
  id,
  multiline = false,
  headerInsert = true,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  fields: EntityField[];
  placeholder?: string;
  id?: string;
  multiline?: boolean;
  /** Mini braces icon next to the title (entity name template style). */
  headerInsert?: boolean;
}) {
  /** Remount select after insert so the same field can be picked again. */
  const [fieldPickKey, setFieldPickKey] = useState(0);
  const parts = ensureTrailingText(parseTemplateParts(value));
  const activeTextIndexRef = useRef(0);
  const caretRef = useRef(0);
  const inputRefs = useRef<Map<number, TextControl>>(new Map());
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
      setFieldPickKey((key) => key + 1);
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
    setFieldPickKey((key) => key + 1);
  }

  const showPlaceholder =
    Boolean(placeholder) &&
    parts.length === 1 &&
    parts[0]?.kind === "text" &&
    parts[0].text === "";

  function bindTextControl(index: number) {
    return {
      ref: (node: TextControl | null) => {
        if (node) inputRefs.current.set(index, node);
        else inputRefs.current.delete(index);
      },
      id: index === 0 ? id : undefined,
      value: (parts[index] as { kind: "text"; text: string }).text,
      onFocus: (event: FocusEvent<TextControl>) => {
        activeTextIndexRef.current = index;
        caretRef.current = event.currentTarget.selectionStart ?? 0;
      },
      onSelect: (event: SyntheticEvent<TextControl>) => {
        activeTextIndexRef.current = index;
        caretRef.current = event.currentTarget.selectionStart ?? 0;
      },
      onClick: (event: MouseEvent<TextControl>) => {
        activeTextIndexRef.current = index;
        caretRef.current = event.currentTarget.selectionStart ?? 0;
      },
      onKeyUp: (event: KeyboardEvent<TextControl>) => {
        caretRef.current = event.currentTarget.selectionStart ?? 0;
      },
      onChange: (
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        caretRef.current = event.currentTarget.selectionStart ?? 0;
        activeTextIndexRef.current = index;
        updateText(index, event.target.value);
      },
      onKeyDown: (event: KeyboardEvent<TextControl>) => {
        if (event.key !== "Backspace") return;
        const part = parts[index];
        if (!part || part.kind !== "text" || part.text !== "") return;
        if (index === 0) return;
        const prev = parts[index - 1];
        if (prev?.kind !== "field") return;
        event.preventDefault();
        removeField(index - 1);
      },
    };
  }

  const fieldPicker =
    fields.length > 0 ? (
      <Select
        key={fieldPickKey}
        onValueChange={(next) => {
          if (next == null) return;
          const field = fields.find((item) => item.id === String(next));
          if (!field) return;
          insertField(field);
        }}
      >
        <SelectTrigger
          id={id ? `${id}-field` : undefined}
          size="sm"
          aria-label="Вставить поле"
          title="Вставить поле"
          className={cn(
            "shrink-0 bg-background",
            headerInsert
              ? "h-6 w-6 justify-center gap-0 rounded-md p-0 shadow-none data-[size=sm]:h-6 data-[size=sm]:w-6 [&>svg:last-child]:hidden"
              : "h-7 w-full",
          )}
        >
          {headerInsert ? (
            <Braces className="size-3 text-muted-foreground" aria-hidden />
          ) : (
            <SelectValue placeholder="Вставить поле">Вставить поле</SelectValue>
          )}
        </SelectTrigger>
        <SelectContent align="end">
          {fields.map((field) => (
            <SelectItem key={field.id} value={field.id}>
              {getEntityFieldDisplayName(field)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {title.trim() || headerInsert ? (
        <div className="flex min-w-0 items-center justify-between gap-2">
          {title.trim() ? (
            <Label
              htmlFor={id}
              className="text-xs font-medium text-muted-foreground"
            >
              {title}
            </Label>
          ) : (
            <span className="min-w-0" />
          )}
          {headerInsert ? fieldPicker : null}
        </div>
      ) : null}

      <div
        className={cn(
          "relative flex w-full min-w-0 flex-wrap gap-x-0.5 gap-y-0.5 rounded-md border border-input bg-transparent px-2 shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          "dark:bg-input/30",
          multiline
            ? "min-h-20 items-start py-1.5"
            : "min-h-8 items-center py-1",
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
          <span
            className={cn(
              "pointer-events-none absolute text-sm text-muted-foreground",
              multiline
                ? "left-2.5 top-1.5"
                : "left-2.5 top-1/2 -translate-y-1/2",
            )}
          >
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
                className={multiline ? "mt-0.5" : undefined}
              />
            );
          }

          const isLast = index === parts.length - 1;
          const control = bindTextControl(index);

          if (multiline) {
            return (
              <textarea
                key={`text-${index}`}
                {...control}
                rows={isLast && parts.length === 1 ? 3 : 1}
                className={cn(
                  "min-w-[1ch] resize-none border-0 bg-transparent py-0 text-sm leading-5 outline-none",
                  isLast && "min-w-[3ch] min-h-[3.75rem] flex-1",
                )}
              />
            );
          }

          return (
            <input
              key={`text-${index}`}
              {...control}
              className={cn(
                "min-w-[1ch] border-0 bg-transparent py-0 text-sm leading-5 outline-none",
                isLast && "min-w-[3ch] flex-1",
              )}
              style={
                isLast ? undefined : { width: textInputWidth(part.text, 1) }
              }
            />
          );
        })}
      </div>

      {!headerInsert ? fieldPicker : null}
    </div>
  );
}
