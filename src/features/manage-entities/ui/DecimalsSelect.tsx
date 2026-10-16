import {
  SettingSelect,
  type SettingOption,
} from "@/shared/ui/setting-controls";
import type { EntityNumberDecimals } from "@/entities/entity";

const DECIMALS_OPTIONS: SettingOption[] = [
  { value: "0", label: "Без дробной части" },
  { value: "1", label: "1 знак" },
  { value: "2", label: "2 знака" },
];

export function DecimalsSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EntityNumberDecimals;
  onChange: (value: EntityNumberDecimals) => void;
}) {
  return (
    <SettingSelect
      id={id}
      title="Точность"
      description="Знаков после запятой"
      value={String(value)}
      options={DECIMALS_OPTIONS}
      onChange={(next) => {
        const decimals = Number(next);
        onChange(decimals === 0 || decimals === 1 ? decimals : 2);
      }}
    />
  );
}
