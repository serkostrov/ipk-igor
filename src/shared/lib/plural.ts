/** Russian plural form: 1 файл, 2 файла, 5 файлов. */
export function pluralRu(
  count: number,
  one: string,
  few: string,
  many: string,
) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
