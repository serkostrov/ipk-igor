/**
 * Import Bitrix Excel dumps (pre-converted JSON) into CRM Контрагенты / Контакты.
 *
 * Usage:
 *   node scripts/crm-import/import-crm.mjs --dry-run
 *   node scripts/crm-import/import-crm.mjs --apply
 *
 * Source JSON: scripts/crm-import/source/{counterparties,contacts}.json
 * Responsible map: scripts/crm-import/responsible-map.json
 * Output: scripts/crm-import/out/
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { sanitizeImportedComment } from "./sanitize-comment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const outDir = join(__dirname, "out");

const envText = readFileSync(join(root, ".env"), "utf8");
const URL = envText.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const KEY = envText.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!URL || !KEY)
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env");

const ENTITY_CP = "entity-02300c84-41e0-4f71-9f37-19edef1d56e6";
const ENTITY_CT = "entity-faad307b-dafb-486d-a05e-4500100c6d1a";
const ENTITY_USERS = "entity-system-users";

const F = {
  cpName: "field-fc493866-ec61-4867-b405-f7cdb4f8b2d7",
  cpOwnership: "field-4a6d9db8-12e2-460e-91f3-7e7bb1c579dd",
  cpPhone: "field-8848d35e-e3bc-4f10-9a82-ecc2e9ad35ba",
  cpEmail: "field-cb366926-17aa-4037-bb27-81442de66316",
  cpSite: "field-d057c8ca-bf1b-4285-ab80-f935994a055f",
  cpFactAddr: "field-60e3c5c2-c886-4931-b752-b6b0d232a13c",
  cpType: "field-d15f2fb5-c383-475f-9281-c9bd38a06d24",
  cpResponsible: "field-88074812-f31b-493f-8ac0-6c65b76d755e",
  cpSphere: "field-a77cf3ba-d83b-44ab-9e13-2a3e695ac9d2",
  cpComment: "field-cad6973c-edda-483d-a3a2-00cf24c4d9da",

  ctFio: "field-acba532e-efe7-44b5-bef3-4c2b77defdbd",
  ctCounterparty: "field-c0705285-201b-4fc7-a359-4e127aa53aba",
  ctPosition: "field-f5dce049-29d5-46f2-bd55-eb003ee716ba",
  ctPhoneWork: "field-f8efc500-46d7-4a12-9b0f-5eef91a08a29",
  ctPhoneExtra: "field-2b37cec7-3f9e-408a-a936-e067968e01ad",
  ctEmail: "field-acc05c8e-39c9-4e9e-85e0-e912fddaeaae",
  ctBirthday: "field-61349024-e268-45c2-bd4b-d99c53c5ee7b",
  ctResponsible: "field-515c105c-f42a-4790-8019-19e4f53c2503",
  ctComment: "field-23395c00-3e03-498b-994a-4ffcf5088b1d",

  userName: "field-system-users-name",
};

const OWNERSHIP = {
  ООО: "list-df7daa8e-1f93-4a9c-b26d-a5df74f2a10f",
  ИП: "list-4da84825-19f8-4482-88af-c4516f26a163",
  ЗАО: "list-ea836b44-4089-4af0-8269-e7227e150775",
  АО: "list-fc177a89-e0c3-4fe2-8a0c-b29cc91a6f37",
  СЗ: "list-0ddcb88d-6ae3-44b4-903d-9cc626d3ed1c",
};

const COMPANY_TYPE = {
  Клиент: "list-ddb4a57f-5c36-4887-b2d3-528889ddd3c8",
  "Потенциальный клиент": "list-8168f605-3431-4640-bc0f-02248e6af806",
  Подрядчик: "list-7ef8a437-9ff7-48c6-b7ef-5192cbbaf148",
  "Потенциальный подрядчик": "list-d341f186-6e44-4cf7-9093-73825a594259",
  "В проработке": "list-057007e8-2d93-4a98-9192-f5ff554d1a2a",
  Архив: "list-37862e0e-8d01-40c0-90ac-853b869ac60d",
  "Архив (клиенты)": "list-37862e0e-8d01-40c0-90ac-853b869ac60d",
  Разобрать: "list-057007e8-2d93-4a98-9192-f5ff554d1a2a",
};

const SPHERE = {
  Производство: "list-fc145e48-b2a1-4466-95ee-b96346a6964a",
  "Проектный институт": "list-9edb68ce-cea6-47e0-a5a5-c05ec71dbfc0",
  "Строительная компания": "list-ae6d5bc2-57cf-4560-b221-72ae72498359",
  "Проектная компания": "list-9edb68ce-cea6-47e0-a5a5-c05ec71dbfc0",
  Завод: "list-fc145e48-b2a1-4466-95ee-b96346a6964a",
  Нефтехимия: "list-793dfeef-5f2b-4c13-be15-8cd8a56de46e",
  Нефтепереработка: "list-ce5c9770-fa66-477d-aae7-bb485f307502",
};

const apply = process.argv.includes("--apply");
const dryRun = !apply || process.argv.includes("--dry-run");
const mode = apply && !process.argv.includes("--dry-run") ? "apply" : "dry-run";

function text(v) {
  if (v == null) return "";
  return String(v).trim();
}

function normName(s) {
  return text(s)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»""„‟‛’`']/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function splitMulti(raw) {
  const s = text(raw);
  if (!s) return [];
  return s
    .split(/[,;|/]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinCommentParts(parts) {
  return sanitizeImportedComment(
    parts
      .map((p) => text(p))
      .filter(Boolean)
      .join("\n\n"),
  );
}

function normalizePhone(raw) {
  if (raw == null || raw === "") return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  // strip leading trunk markers already handled; handle 8XXXXXXXXXX / 7XXXXXXXXXX / 10 digits
  if (digits.length === 11 && digits.startsWith("8"))
    digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length < 11) return null;
  // keep first 11 if longer (extensions glued)
  if (digits.length > 11 && digits.startsWith("7"))
    digits = digits.slice(0, 11);
  if (!(digits.length === 11 && digits.startsWith("7"))) return null;
  return `+${digits}`;
}

function extractEmails(raw) {
  const s = text(raw);
  if (!s) return [];
  const found = [];
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let m;
  while ((m = re.exec(s))) found.push(m[0].toLowerCase());
  return [...new Set(found)];
}

function parseBirthday(raw) {
  const s = text(raw);
  if (!s) return "";
  // DD.MM.YYYY or ISO
  const dm = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dm) {
    const [, d, mo, y] = dm;
    if (y === "0001") return "";
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

function fullnessScore(row) {
  let n = 0;
  for (const k of [
    "Рабочий телефон",
    "Мобильный телефон",
    "Рабочий e-mail",
    "Фактический адрес компании",
    "Корпоративный сайт",
    "Комментарий",
    "Форма собственности",
    "Сфера деятельности",
  ]) {
    if (text(row[k])) n += 1;
  }
  return n;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(path, rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  }
  writeFileSync(path, lines.join("\n"), "utf8");
}

async function api(token, path, opts = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const body = await r.text();
  let data;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = body;
  }
  if (!r.ok) throw new Error(`${r.status} ${path}: ${body.slice(0, 500)}`);
  return data;
}

async function auth() {
  const email = `crm-import-${Date.now()}@centripk.ru`;
  const signup = await fetch(`${URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "CrmImport1!" }),
  });
  const authJson = await signup.json();
  if (!authJson.access_token) {
    // try login in case user exists
    const login = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "CrmImport1!" }),
    });
    const loginJson = await login.json();
    if (!loginJson.access_token) {
      throw new Error(`auth failed: ${JSON.stringify(authJson)}`);
    }
    return loginJson.access_token;
  }
  return authJson.access_token;
}

async function fetchAllRecords(token, entityId) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const rows = await api(
      token,
      `entity_records?entity_id=eq.${entityId}&select=id,field_values`,
      { headers: { Range: `${from}-${to}`, Prefer: "count=exact" } },
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function upsertRecord(token, { id, entity_id, field_values }) {
  const found = await api(token, `entity_records?id=eq.${id}&select=id`);
  if (found?.length) {
    await api(token, `entity_records?id=eq.${id}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ field_values }),
    });
    return "updated";
  }
  await api(token, "entity_records", {
    method: "POST",
    prefer: "return=minimal",
    body: JSON.stringify({ id, entity_id, field_values }),
  });
  return "inserted";
}

function resolveResponsible(label, responsibleMap, usersByName) {
  const raw = text(label);
  if (!raw) return null;
  if (responsibleMap[raw]) return responsibleMap[raw];
  const n = normName(raw);
  if (usersByName.has(n)) return usersByName.get(n);
  // Фамилия Имя vs Фамилия Имя Отчество
  const parts = n.split(" ");
  if (parts.length >= 2) {
    const key2 = `${parts[0]} ${parts[1]}`;
    if (usersByName.has(key2)) return usersByName.get(key2);
    for (const [k, id] of usersByName) {
      const kp = k.split(" ");
      if (kp[0] === parts[0] && kp[1] === parts[1]) return id;
    }
  }
  return null;
}

function buildCpFieldValues(row, responsibleId) {
  const commentParts = [];
  if (text(row["Комментарий"])) commentParts.push(text(row["Комментарий"]));

  const phoneSources = [
    row["Рабочий телефон"],
    row["Мобильный телефон"],
    row["Другой телефон"],
  ];
  const allPhones = [];
  for (const src of phoneSources) {
    for (const part of splitMulti(src)) {
      const p = normalizePhone(part);
      if (p) allPhones.push(p);
      else if (text(part)) commentParts.push(`тел(raw): ${part}`);
    }
  }
  const phone = allPhones[0] || "";
  if (allPhones.length > 1)
    commentParts.push(`доп. телефоны: ${allPhones.slice(1).join(", ")}`);

  const emails = [
    ...extractEmails(row["Рабочий e-mail"]),
    ...extractEmails(row["E-mail для рассылок"]),
  ];
  const email = emails[0] || "";
  if (emails.length > 1)
    commentParts.push(`доп. email: ${emails.slice(1).join(", ")}`);

  let addr = text(row["Фактический адрес компании"]);
  const city = text(row["Город"]);
  if (!addr && city) addr = city;

  const comment = joinCommentParts(commentParts);
  const fv = {
    [F.cpName]: text(row["Название компании"]),
    [F.cpResponsible]: responsibleId,
  };
  if (comment) fv[F.cpComment] = comment;
  if (phone) fv[F.cpPhone] = phone;
  if (email) fv[F.cpEmail] = email;
  if (text(row["Корпоративный сайт"]))
    fv[F.cpSite] = text(row["Корпоративный сайт"]);
  if (addr) fv[F.cpFactAddr] = addr;

  const ownership = OWNERSHIP[text(row["Форма собственности"])];
  if (ownership) fv[F.cpOwnership] = ownership;

  const ctype = COMPANY_TYPE[text(row["Тип компании"])];
  if (ctype) fv[F.cpType] = ctype;

  const sphere = SPHERE[text(row["Сфера деятельности"])];
  if (sphere) fv[F.cpSphere] = sphere;

  return fv;
}

function buildCtFieldValues(row, responsibleId, counterpartyId) {
  const fio = [row["Фамилия"], row["Имя"], row["Отчество"]]
    .map(text)
    .filter(Boolean)
    .join(" ");

  const commentParts = [];
  if (text(row["Тип контакта"]))
    commentParts.push(`Тип контакта: ${text(row["Тип контакта"])}`);
  if (text(row["Источник"]))
    commentParts.push(`Источник: ${text(row["Источник"])}`);
  if (text(row["Комментарий"])) commentParts.push(text(row["Комментарий"]));

  const workParts = splitMulti(row["Рабочий телефон"]);
  const extraParts = [
    ...splitMulti(row["Мобильный телефон"]),
    ...splitMulti(row["Другой телефон"]),
  ];
  const workPhones = workParts.map(normalizePhone).filter(Boolean);
  const extraPhones = extraParts.map(normalizePhone).filter(Boolean);
  for (const part of [...workParts, ...extraParts]) {
    if (text(part) && !normalizePhone(part))
      commentParts.push(`тел(raw): ${part}`);
  }
  const phoneWork = workPhones[0] || "";
  let phoneExtra = extraPhones[0] || workPhones[1] || "";
  const leftoverPhones = [
    ...workPhones.slice(phoneWork ? 1 : 0),
    ...extraPhones.slice(phoneExtra && extraPhones[0] === phoneExtra ? 1 : 0),
  ].filter((p) => p !== phoneWork && p !== phoneExtra);
  if (leftoverPhones.length)
    commentParts.push(`доп. телефоны: ${leftoverPhones.join(", ")}`);

  const emails = [
    ...extractEmails(row["Рабочий e-mail"]),
    ...extractEmails(row["Частный e-mail"]),
    ...extractEmails(row["Другой e-mail"]),
    ...extractEmails(row["Имейл"]),
  ];
  const email = emails[0] || "";
  if (emails.length > 1)
    commentParts.push(`доп. email: ${emails.slice(1).join(", ")}`);

  const birthday = parseBirthday(row["Дата рождения"]);

  const comment = joinCommentParts(commentParts);
  const fv = {
    [F.ctFio]: fio,
    [F.ctCounterparty]: counterpartyId,
  };
  if (comment) fv[F.ctComment] = comment;
  if (responsibleId) fv[F.ctResponsible] = responsibleId;
  if (text(row["Должность"])) fv[F.ctPosition] = text(row["Должность"]);
  if (phoneWork) fv[F.ctPhoneWork] = phoneWork;
  if (phoneExtra) fv[F.ctPhoneExtra] = phoneExtra;
  if (email) fv[F.ctEmail] = email;
  if (birthday) fv[F.ctBirthday] = birthday;
  return fv;
}

function prepareCounterparties(rows, responsibleMap, usersByName) {
  const quarantine = [];
  const candidates = [];

  for (const row of rows) {
    const bitrixId = text(row.ID);
    const name = text(row["Название компании"]);
    if (!bitrixId || !name) {
      quarantine.push({
        bitrix_id: bitrixId,
        name,
        reason: "validation",
        detail: "missing id or name",
        responsible: text(row["Ответственный"]),
      });
      continue;
    }
    const resp = resolveResponsible(
      row["Ответственный"],
      responsibleMap,
      usersByName,
    );
    if (!resp) {
      quarantine.push({
        bitrix_id: bitrixId,
        name,
        reason: "unresolved_responsible",
        detail: text(row["Ответственный"]),
        responsible: text(row["Ответственный"]),
      });
      continue;
    }
    candidates.push({
      bitrixId,
      name,
      norm: normName(name),
      score: fullnessScore(row),
      responsibleId: resp,
      row,
      recordId: `record-bitrix-cp-${bitrixId}`,
    });
  }

  // dedupe by normalized name — keep fullest
  const byNorm = new Map();
  for (const c of candidates) {
    const prev = byNorm.get(c.norm);
    if (!prev) {
      byNorm.set(c.norm, c);
      continue;
    }
    const winner = c.score > prev.score ? c : prev;
    const loser = winner === c ? prev : c;
    byNorm.set(c.norm, winner);
    quarantine.push({
      bitrix_id: loser.bitrixId,
      name: loser.name,
      reason: "duplicate_name",
      detail: `winner_bitrix=${winner.bitrixId}`,
      responsible: text(loser.row["Ответственный"]),
    });
  }

  return { ready: [...byNorm.values()], quarantine };
}

function prepareContacts(rows, responsibleMap, usersByName, cpIndex) {
  const quarantine = [];
  const candidates = [];

  for (const row of rows) {
    const bitrixId = text(row.ID);
    const fio = [row["Фамилия"], row["Имя"], row["Отчество"]]
      .map(text)
      .filter(Boolean)
      .join(" ");
    if (!bitrixId || !fio) {
      quarantine.push({
        bitrix_id: bitrixId,
        fio,
        company: text(row["Компания"]),
        reason: "validation",
        detail: "missing id or fio",
        responsible: text(row["Ответственный"]),
      });
      continue;
    }

    const resp = resolveResponsible(
      row["Ответственный"],
      responsibleMap,
      usersByName,
    );
    if (!resp) {
      quarantine.push({
        bitrix_id: bitrixId,
        fio,
        company: text(row["Компания"]),
        reason: "unresolved_responsible",
        detail: text(row["Ответственный"]),
        responsible: text(row["Ответственный"]),
      });
      continue;
    }

    const company = text(row["Компания"]);
    if (!company) {
      quarantine.push({
        bitrix_id: bitrixId,
        fio,
        company: "",
        reason: "missing_company",
        detail: "",
        responsible: text(row["Ответственный"]),
      });
      continue;
    }

    const cpId =
      cpIndex.byExact.get(company) ||
      cpIndex.byNorm.get(normName(company)) ||
      null;
    if (!cpId) {
      quarantine.push({
        bitrix_id: bitrixId,
        fio,
        company,
        reason: "company_not_found",
        detail: company,
        responsible: text(row["Ответственный"]),
      });
      continue;
    }

    const phone =
      normalizePhone(splitMulti(row["Рабочий телефон"])[0] || "") ||
      normalizePhone(splitMulti(row["Мобильный телефон"])[0] || "") ||
      "";

    candidates.push({
      bitrixId,
      fio,
      company,
      phone,
      dedupeKey: `${normName(fio)}|${phone}|${normName(company)}`,
      responsibleId: resp,
      counterpartyId: cpId,
      row,
      recordId: `record-bitrix-ct-${bitrixId}`,
    });
  }

  const byKey = new Map();
  for (const c of candidates) {
    const prev = byKey.get(c.dedupeKey);
    if (!prev) {
      byKey.set(c.dedupeKey, c);
      continue;
    }
    // keep higher bitrix id (newer)
    const winner = Number(c.bitrixId) >= Number(prev.bitrixId) ? c : prev;
    const loser = winner === c ? prev : c;
    byKey.set(c.dedupeKey, winner);
    quarantine.push({
      bitrix_id: loser.bitrixId,
      fio: loser.fio,
      company: loser.company,
      reason: "duplicate_person",
      detail: `winner_bitrix=${winner.bitrixId}`,
      responsible: text(loser.row["Ответственный"]),
    });
  }

  return { ready: [...byKey.values()], quarantine };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  console.log(`mode=${mode}`);

  const cpSource = JSON.parse(
    readFileSync(join(__dirname, "source/counterparties.json"), "utf8"),
  );
  const ctSource = JSON.parse(
    readFileSync(join(__dirname, "source/contacts.json"), "utf8"),
  );
  const mapFile = JSON.parse(
    readFileSync(join(__dirname, "responsible-map.json"), "utf8"),
  );
  const responsibleMap = mapFile.map || mapFile;

  const token = await auth();
  console.log("authenticated");

  const users = await fetchAllRecords(token, ENTITY_USERS);
  const usersByName = new Map();
  for (const u of users) {
    const name = text(u.field_values?.[F.userName]);
    if (!name) continue;
    const n = normName(name);
    usersByName.set(n, u.id);
    const parts = n.split(" ");
    if (parts.length >= 2) {
      const short = `${parts[0]} ${parts[1]}`;
      if (!usersByName.has(short)) usersByName.set(short, u.id);
    }
  }
  // overlay explicit map (departments etc.)
  for (const [label, id] of Object.entries(responsibleMap)) {
    if (label.startsWith("_")) continue;
    if (typeof id === "string" && id.startsWith("record-")) {
      // already in map object
    }
  }

  const existingCp = await fetchAllRecords(token, ENTITY_CP);
  console.log(
    `source CP=${cpSource.length} CT=${ctSource.length}; existing CP=${existingCp.length}; users=${users.length}`,
  );

  const { ready: cpReady, quarantine: cpQ } = prepareCounterparties(
    cpSource,
    responsibleMap,
    usersByName,
  );
  console.log(`CP ready=${cpReady.length} quarantine=${cpQ.length}`);

  // Build name index: existing + to-import
  const cpIndex = { byExact: new Map(), byNorm: new Map() };
  function indexCp(name, recordId) {
    if (!name || !recordId) return;
    if (!cpIndex.byExact.has(name)) cpIndex.byExact.set(name, recordId);
    const n = normName(name);
    if (!cpIndex.byNorm.has(n)) cpIndex.byNorm.set(n, recordId);
  }
  for (const r of existingCp) {
    indexCp(text(r.field_values?.[F.cpName]), r.id);
  }
  // Prefer importing bitrix records for names we are about to upsert
  // (existing test records keep their ids if name matches and we don't overwrite)
  const cpToUpsert = [];
  const cpLinkedExisting = [];
  for (const c of cpReady) {
    const existingId =
      cpIndex.byExact.get(c.name) || cpIndex.byNorm.get(c.norm);
    if (existingId && !String(existingId).startsWith("record-bitrix-cp-")) {
      // link to existing stand record, do not create duplicate
      cpLinkedExisting.push({
        ...c,
        recordId: existingId,
        linked_existing: true,
      });
      indexCp(c.name, existingId);
    } else {
      cpToUpsert.push(c);
      indexCp(c.name, c.recordId);
    }
  }

  // Contacts need index including linked + upserted names
  const { ready: ctReady, quarantine: ctQ } = prepareContacts(
    ctSource,
    responsibleMap,
    usersByName,
    cpIndex,
  );
  console.log(
    `CT ready=${ctReady.length} quarantine=${ctQ.length}; CP upsert=${cpToUpsert.length} linked_existing=${cpLinkedExisting.length}`,
  );

  const unmapped = {};
  for (const q of [...cpQ, ...ctQ]) {
    if (q.reason !== "unresolved_responsible") continue;
    const key = q.detail || q.responsible || "?";
    unmapped[key] = (unmapped[key] || 0) + 1;
  }
  writeFileSync(
    join(outDir, "unmapped_responsible.json"),
    JSON.stringify(unmapped, null, 2),
    "utf8",
  );

  writeCsv(join(outDir, "quarantine_counterparties.csv"), cpQ, [
    "bitrix_id",
    "name",
    "reason",
    "detail",
    "responsible",
  ]);
  writeCsv(join(outDir, "quarantine_contacts.csv"), ctQ, [
    "bitrix_id",
    "fio",
    "company",
    "reason",
    "detail",
    "responsible",
  ]);

  const manifest = {
    mode,
    at: new Date().toISOString(),
    counts: {
      source_cp: cpSource.length,
      source_ct: ctSource.length,
      cp_ready: cpReady.length,
      cp_upsert: cpToUpsert.length,
      cp_linked_existing: cpLinkedExisting.length,
      cp_quarantine: cpQ.length,
      ct_ready: ctReady.length,
      ct_quarantine: ctQ.length,
    },
    counterparties: {},
    contacts: {},
    stats: {
      cp_inserted: 0,
      cp_updated: 0,
      ct_inserted: 0,
      ct_updated: 0,
      errors: [],
    },
  };

  if (mode === "dry-run") {
    for (const c of [...cpToUpsert, ...cpLinkedExisting]) {
      manifest.counterparties[c.bitrixId] = {
        recordId: c.recordId,
        name: c.name,
        linked_existing: !!c.linked_existing,
        action: c.linked_existing ? "link_existing" : "would_upsert",
      };
    }
    for (const c of ctReady) {
      manifest.contacts[c.bitrixId] = {
        recordId: c.recordId,
        fio: c.fio,
        counterpartyId: c.counterpartyId,
        action: "would_upsert",
      };
    }
    writeFileSync(
      join(outDir, "import_manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    writeFileSync(
      join(outDir, "reconciliation.md"),
      [
        `# CRM import reconciliation (${mode})`,
        "",
        `- Source counterparties: ${cpSource.length}`,
        `- CP ready / quarantine: ${cpReady.length} / ${cpQ.length}`,
        `- CP would upsert / link existing: ${cpToUpsert.length} / ${cpLinkedExisting.length}`,
        `- Source contacts: ${ctSource.length}`,
        `- CT ready / quarantine: ${ctReady.length} / ${ctQ.length}`,
        `- Unmapped responsible labels: ${Object.keys(unmapped).length}`,
        "",
        "Quarantine reason breakdown (CP):",
        ...Object.entries(
          cpQ.reduce((a, r) => ((a[r.reason] = (a[r.reason] || 0) + 1), a), {}),
        ).map(([k, v]) => `- ${k}: ${v}`),
        "",
        "Quarantine reason breakdown (CT):",
        ...Object.entries(
          ctQ.reduce((a, r) => ((a[r.reason] = (a[r.reason] || 0) + 1), a), {}),
        ).map(([k, v]) => `- ${k}: ${v}`),
        "",
        "Check `quarantine_*.csv` and `unmapped_responsible.json`.",
      ].join("\n"),
    );
    console.log("dry-run complete → scripts/crm-import/out/");
    console.log(JSON.stringify(manifest.counts, null, 2));
    return;
  }

  // APPLY counterparties
  let i = 0;
  for (const c of cpToUpsert) {
    i += 1;
    try {
      const fv = buildCpFieldValues(c.row, c.responsibleId);
      const action = await upsertRecord(token, {
        id: c.recordId,
        entity_id: ENTITY_CP,
        field_values: fv,
      });
      if (action === "inserted") manifest.stats.cp_inserted += 1;
      else manifest.stats.cp_updated += 1;
      manifest.counterparties[c.bitrixId] = {
        recordId: c.recordId,
        name: c.name,
        action,
      };
    } catch (e) {
      manifest.stats.errors.push({
        entity: "cp",
        bitrixId: c.bitrixId,
        error: String(e.message || e),
      });
      cpQ.push({
        bitrix_id: c.bitrixId,
        name: c.name,
        reason: "write_error",
        detail: String(e.message || e).slice(0, 300),
        responsible: text(c.row["Ответственный"]),
      });
    }
    if (i % 100 === 0) console.log(`CP progress ${i}/${cpToUpsert.length}`);
  }
  for (const c of cpLinkedExisting) {
    manifest.counterparties[c.bitrixId] = {
      recordId: c.recordId,
      name: c.name,
      action: "link_existing",
    };
  }

  // Re-index from DB after upsert for safety
  const cpAfter = await fetchAllRecords(token, ENTITY_CP);
  const cpIndex2 = { byExact: new Map(), byNorm: new Map() };
  for (const r of cpAfter) {
    const name = text(r.field_values?.[F.cpName]);
    if (!name) continue;
    if (!cpIndex2.byExact.has(name)) cpIndex2.byExact.set(name, r.id);
    const n = normName(name);
    if (!cpIndex2.byNorm.has(n)) cpIndex2.byNorm.set(n, r.id);
  }
  // also keep planned bitrix ids
  for (const c of cpToUpsert) {
    if (!cpIndex2.byExact.has(c.name)) cpIndex2.byExact.set(c.name, c.recordId);
    if (!cpIndex2.byNorm.has(c.norm)) cpIndex2.byNorm.set(c.norm, c.recordId);
  }

  // Re-prepare contacts against final CP index (those quarantined for company may stay)
  const { ready: ctReady2, quarantine: ctQ2 } = prepareContacts(
    ctSource,
    responsibleMap,
    usersByName,
    cpIndex2,
  );
  // merge new quarantine with previous unresolved_responsible etc — replace
  writeCsv(join(outDir, "quarantine_contacts.csv"), ctQ2, [
    "bitrix_id",
    "fio",
    "company",
    "reason",
    "detail",
    "responsible",
  ]);
  writeCsv(join(outDir, "quarantine_counterparties.csv"), cpQ, [
    "bitrix_id",
    "name",
    "reason",
    "detail",
    "responsible",
  ]);

  i = 0;
  for (const c of ctReady2) {
    i += 1;
    try {
      const fv = buildCtFieldValues(c.row, c.responsibleId, c.counterpartyId);
      const action = await upsertRecord(token, {
        id: c.recordId,
        entity_id: ENTITY_CT,
        field_values: fv,
      });
      if (action === "inserted") manifest.stats.ct_inserted += 1;
      else manifest.stats.ct_updated += 1;
      manifest.contacts[c.bitrixId] = {
        recordId: c.recordId,
        fio: c.fio,
        counterpartyId: c.counterpartyId,
        action,
      };
    } catch (e) {
      manifest.stats.errors.push({
        entity: "ct",
        bitrixId: c.bitrixId,
        error: String(e.message || e),
      });
    }
    if (i % 200 === 0) console.log(`CT progress ${i}/${ctReady2.length}`);
  }

  manifest.counts.ct_ready = ctReady2.length;
  manifest.counts.ct_quarantine = ctQ2.length;
  writeFileSync(
    join(outDir, "import_manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  const cpCount = (await fetchAllRecords(token, ENTITY_CP)).length;
  const ctCount = (await fetchAllRecords(token, ENTITY_CT)).length;
  writeFileSync(
    join(outDir, "reconciliation.md"),
    [
      `# CRM import reconciliation (${mode})`,
      "",
      `- CP inserted/updated: ${manifest.stats.cp_inserted}/${manifest.stats.cp_updated}`,
      `- CT inserted/updated: ${manifest.stats.ct_inserted}/${manifest.stats.ct_updated}`,
      `- DB counts now: CP=${cpCount} CT=${ctCount}`,
      `- CP quarantine: ${cpQ.length}`,
      `- CT quarantine: ${ctQ2.length}`,
      `- Errors: ${manifest.stats.errors.length}`,
      "",
      manifest.stats.errors.length
        ? "First errors:\n" +
          manifest.stats.errors
            .slice(0, 20)
            .map((e) => `- ${e.entity} ${e.bitrixId}: ${e.error}`)
            .join("\n")
        : "No write errors.",
    ].join("\n"),
  );
  console.log("apply complete");
  console.log(
    JSON.stringify(
      { ...manifest.counts, ...manifest.stats, cpCount, ctCount },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
