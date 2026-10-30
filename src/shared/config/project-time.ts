/**
 * Single project wall-clock timezone.
 * Entity dates / «сегодня» / «сейчас» / UI timestamps use this zone.
 * Supabase `timestamptz` stays UTC on the wire.
 */
export const PROJECT_TIMEZONE = "Europe/Moscow" as const;
export const PROJECT_LOCALE = "ru-RU" as const;
