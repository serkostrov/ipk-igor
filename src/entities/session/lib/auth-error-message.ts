type AuthErrorKind = "login" | "register";

/** Short human-readable auth errors for UI. */
export function getAuthErrorMessage(
  error: unknown,
  kind: AuthErrorKind = "login",
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.trim().toLowerCase();
  const fallback =
    kind === "register" ? "Не удалось зарегистрироваться" : "Не удалось войти";

  if (!message) return fallback;

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials") ||
    message.includes("user not found") ||
    message.includes("wrong password") ||
    message.includes("invalid email or password")
  ) {
    return "Неверный email или пароль";
  }

  if (
    message.includes("email not confirmed") ||
    message.includes("not confirmed")
  ) {
    return "Подтвердите email";
  }

  if (
    message.includes("too many requests") ||
    message.includes("rate limit") ||
    message.includes("over_request_rate_limit")
  ) {
    return "Слишком много попыток. Подождите";
  }

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("failed to fetch")
  ) {
    return "Нет соединения. Попробуйте ещё раз";
  }

  if (
    message.includes("user already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists")
  ) {
    return "Такой email уже зарегистрирован";
  }

  if (
    message.includes("password") &&
    (message.includes("weak") ||
      message.includes("least") ||
      message.includes("short") ||
      message.includes("characters") ||
      message.includes("6"))
  ) {
    return "Пароль слишком короткий";
  }

  if (
    message.includes("invalid email") ||
    message.includes("unable to validate email")
  ) {
    return "Некорректный email";
  }

  if (
    message.includes("signup is disabled") ||
    message.includes("signups not allowed")
  ) {
    return "Регистрация временно недоступна";
  }

  return fallback;
}
