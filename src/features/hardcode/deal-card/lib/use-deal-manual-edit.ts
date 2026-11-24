import { useState } from "react";
import { useCanEntity } from "@/entities/access";
import {
  normalizeEntityDecimalInput,
  parseEntityDecimal,
  updateEntityRecord,
  type EntityRecord,
} from "@/entities/entity";
import type { DealCardSources } from "../match";
import type {
  DealColumnOverrides,
  DealOverrides,
  DealProfitabilityColumn,
} from "../model/calculations";
import type { DealCalculationSide } from "../model/calculation-rows";
import { DEAL_OVERRIDES_KEY, serializeDealOverrides } from "../model/overrides";

type Key = keyof DealProfitabilityColumn;
type Draft = Record<DealCalculationSide, Partial<Record<Key, string>>>;

function toDraft(overrides: DealOverrides): Draft {
  const side = (column: DealColumnOverrides) =>
    Object.fromEntries(
      Object.entries(column).map(([key, value]) => [
        key,
        String(value).replace(".", ","),
      ]),
    );
  return { plan: side(overrides.plan), fact: side(overrides.fact) };
}

function fromDraft(draft: Draft): DealOverrides {
  const side = (column: Draft[DealCalculationSide]) => {
    const out: DealColumnOverrides = {};
    for (const [key, text] of Object.entries(column)) {
      const value = parseEntityDecimal(text ?? "");
      if (Number.isFinite(value)) out[key as Key] = value;
    }
    return out;
  };
  return { plan: side(draft.plan), fact: side(draft.fact) };
}

/**
 * «Расчёт» edit mode: any cell can be typed by hand. Values are stored as one
 * JSON text in the deal record (service key), DB first, then the store. An
 * empty cell returns the automatic value.
 */
export function useDealManualEdit(
  sources: DealCardSources,
  record: EntityRecord,
  overrides: DealOverrides,
) {
  const canEdit = useCanEntity(sources.liveDeal.id, "update");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  function change(side: DealCalculationSide, key: Key, value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [side]: {
              ...current[side],
              [key]: normalizeEntityDecimalInput(value, 2),
            },
          }
        : current,
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await updateEntityRecord(sources.deal.id, record.id, {
        [DEAL_OVERRIDES_KEY]: serializeDealOverrides(fromDraft(draft)),
      });
      setDraft(null);
    } catch {
      // Persist error already surfaced via entity store.
    } finally {
      setSaving(false);
    }
  }

  return {
    editing: draft != null,
    draft,
    saving,
    canEdit,
    start: () => setDraft(toDraft(overrides)),
    cancel: () => setDraft(null),
    change,
    save,
  };
}
