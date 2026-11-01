export const WALLET_PARTS = [
  "main",
  "deposit",
  "overdraft",
  "factoring",
] as const;

export type WalletPart = (typeof WALLET_PARTS)[number];

export const WALLET_PART_LABELS: Record<WalletPart, string> = {
  main: "Расчетный счет",
  deposit: "Депозит",
  overdraft: "Овердрафт",
  factoring: "Факторинг",
};
