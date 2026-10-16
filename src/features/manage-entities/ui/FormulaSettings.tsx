import { useRef, useState } from "react";
import { SquareFunction } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Textarea } from "@/shared/ui/textarea";
import {
  compileFormulaText,
  formatEntityFormulaPreview,
  FORMULA_FUNCTIONS,
  getEntityFormulaOperands,
  getEntityPreviewValueContext,
  useEntityValueContext,
  type Entity,
  type EntityNumberDecimals,
} from "@/entities/entity";
import { SettingLabel } from "@/shared/ui/setting-controls";

type FormulaSettingsProps = {
  /** Entity of the field (operands and preview record). */
  entity: Entity | null;
  fieldId: string | null;
  text: string;
  decimals: EntityNumberDecimals;
  unitSuffix: string | null;
  onTextChange: (text: string) => void;
};

function FormulaFunctionsMenu({
  onInsert,
}: {
  onInsert: (snippet: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          />
        }
      >
        <SquareFunction className="size-3.5" />
        Функции
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-1"
      >
        <div className="max-h-64 overflow-y-auto">
          {FORMULA_FUNCTIONS.map((item) => (
            <button
              key={item.name}
              type="button"
              className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60"
              onClick={() => {
                onInsert(`${item.alias}(`);
                setOpen(false);
              }}
            >
              <span className="font-mono text-xs font-medium text-foreground">
                {item.signature.replace(item.name, item.alias)}
              </span>
              <span className="text-[11px] leading-snug text-muted-foreground">
                {item.description}
              </span>
            </button>
          ))}
        </div>
        <p className="border-t border-border/70 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Операторы: + − * / ( ), сравнения, И, ИЛИ, НЕ.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** Formula text with `[Поле]` names, insert helpers and a live preview. */
export function FormulaSettings({
  entity,
  fieldId,
  text,
  decimals,
  unitSuffix,
  onTextChange,
}: FormulaSettingsProps) {
  const valueContext = useEntityValueContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const operands = entity ? getEntityFormulaOperands(entity, fieldId) : [];
  const compiled = text.trim() ? compileFormulaText(text, operands) : null;
  const sample = entity?.records[0] ?? null;
  const preview =
    compiled?.ok && entity && sample
      ? formatEntityFormulaPreview(
          getEntityPreviewValueContext(valueContext),
          entity,
          sample,
          { expression: compiled.expression, decimals },
          unitSuffix,
        )
      : null;

  function insert(snippet: string) {
    const node = textareaRef.current;
    const start = node?.selectionStart ?? text.length;
    const end = node?.selectionEnd ?? text.length;
    onTextChange(text.slice(0, start) + snippet + text.slice(end));
    requestAnimationFrame(() => {
      if (!node) return;
      const caret = start + snippet.length;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <SettingLabel
          htmlFor="entity-field-formula"
          title="Формула"
          description="Поля в [скобках], аргументы через «;»"
        />
        <FormulaFunctionsMenu onInsert={insert} />
      </div>
      <Textarea
        ref={textareaRef}
        id="entity-field-formula"
        value={text}
        placeholder="[Факт] / [План] * 100"
        spellCheck={false}
        aria-invalid={compiled?.ok === false || undefined}
        className="min-h-16 resize-none bg-background font-mono text-[13px] md:text-[13px]"
        onChange={(event) => onTextChange(event.target.value)}
      />
      {compiled?.ok === false ? (
        <p className="text-[11px] leading-snug text-destructive">
          {compiled.error}
        </p>
      ) : preview != null ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          На первой записи:{" "}
          <span className="font-medium text-foreground tabular-nums">
            {preview}
          </span>
        </p>
      ) : null}
      {operands.length > 0 ? (
        <div className="flex max-h-[4.25rem] flex-wrap gap-1 overflow-y-auto">
          {operands.map((operand) => (
            <button
              key={operand.id}
              type="button"
              className="inline-flex h-6 max-w-[10rem] items-center rounded-md bg-background px-1.5 text-[11px] font-medium text-foreground ring-1 ring-border/70 transition-colors hover:bg-primary/10 hover:text-primary hover:ring-primary/30"
              title={`Вставить [${operand.name}]`}
              onClick={() => insert(`[${operand.name}]`)}
            >
              <span className="truncate">{operand.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
