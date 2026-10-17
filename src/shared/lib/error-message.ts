/** Extract a human-readable message from Error, Postgrest, or plain `{ message }`. */
export function getErrorMessage(error: unknown, fallback = "Ошибка"): string {
  if (typeof error === "string") {
    const trimmed = error.trim();
    return trimmed || fallback;
  }
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed || fallback;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  return fallback;
}

/** Build a clear “do this first” message from blocking task titles. */
export function formatAutomationBlockingMessage(
  taskNames: string[],
  options?: { previous?: boolean },
): string {
  const names = [
    ...new Set(
      taskNames.map((name) => name.trim()).filter((name) => name.length > 0),
    ),
  ];
  if (names.length === 0) {
    return options?.previous
      ? "Сначала выполните предыдущие блокирующие задачи"
      : "Сначала выполните блокирующие задачи автоматизации";
  }
  if (names.length === 1) {
    return `Сначала выполните задачу «${names[0]}»`;
  }
  return `Сначала выполните задачи:\n• ${names.join("\n• ")}`;
}

function extractAutomationGateDetail(
  raw: string,
  code: "AUTOMATION_ORDER" | "AUTOMATION_BLOCKED",
): string | null {
  const match = raw.match(new RegExp(`${code}:\\s*(.+)$`, "i"));
  if (!match?.[1]) return null;
  return match[1].trim().replace(/\.$/, "");
}

function isGenericAutomationGateDetail(
  detail: string,
  code: "AUTOMATION_ORDER" | "AUTOMATION_BLOCKED",
): boolean {
  if (code === "AUTOMATION_ORDER") {
    return /^Сначала выполните предыдущие блокирующие задачи\.?$/i.test(detail);
  }
  return /^Сначала выполните блокирующие задачи автоматизации(\s*\(\d+\))?\.?$/i.test(
    detail,
  );
}

/** Friendly copy for known automation RPC / trigger failures. */
export function getAutomationErrorMessage(
  error: unknown,
  fallback = "Ошибка",
): string {
  const raw = getErrorMessage(error, fallback);

  const orderDetail = extractAutomationGateDetail(raw, "AUTOMATION_ORDER");
  if (orderDetail != null) {
    if (!isGenericAutomationGateDetail(orderDetail, "AUTOMATION_ORDER")) {
      const listed = orderDetail.match(/^Сначала выполните:\s*(.+)$/i)?.[1];
      if (listed) {
        return formatAutomationBlockingMessage(
          listed.split(",").map((part) => part.trim()),
          { previous: true },
        );
      }
      return orderDetail.startsWith("Сначала выполните")
        ? orderDetail
        : formatAutomationBlockingMessage(
            orderDetail.split(",").map((part) => part.trim()),
            { previous: true },
          );
    }
    return "Сначала выполните предыдущие блокирующие задачи";
  }

  const blockedDetail = extractAutomationGateDetail(raw, "AUTOMATION_BLOCKED");
  if (blockedDetail != null) {
    if (!isGenericAutomationGateDetail(blockedDetail, "AUTOMATION_BLOCKED")) {
      const listed = blockedDetail.match(/^Сначала выполните:\s*(.+)$/i)?.[1];
      if (listed) {
        return formatAutomationBlockingMessage(
          listed.split(",").map((part) => part.trim()),
        );
      }
      return blockedDetail.startsWith("Сначала выполните")
        ? blockedDetail
        : formatAutomationBlockingMessage(
            blockedDetail.split(",").map((part) => part.trim()),
          );
    }
    return "Сначала выполните блокирующие задачи автоматизации";
  }

  if (/task is not pending/i.test(raw)) {
    return "Задача уже завершена или отменена";
  }
  if (/task not found/i.test(raw)) {
    return "Задача не найдена";
  }
  if (/outcome not found/i.test(raw)) {
    return "Не выбран результат";
  }
  if (/record not found/i.test(raw)) {
    return "Запись не найдена";
  }
  if (/could not find the function/i.test(raw) || /PGRST202/i.test(raw)) {
    return "На сервере нет функции завершения задачи. Примените миграции Supabase";
  }
  if (/column .*description.* does not exist/i.test(raw)) {
    return "На сервере нет поля description. Примените миграции Supabase";
  }
  return raw
    .replace(/^AUTOMATION_ORDER:\s*/i, "")
    .replace(/^AUTOMATION_BLOCKED:\s*/i, "");
}
