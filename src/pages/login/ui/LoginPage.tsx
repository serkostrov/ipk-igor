import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { isSupabaseConfigured } from "@/shared/api/supabase";
import {
  getAuthErrorMessage,
  signInWithPassword,
  signUpWithPassword,
} from "@/entities/session";

type AuthMode = "login" | "register";

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wipOpen, setWipOpen] = useState(false);

  function switchMode(next: AuthMode) {
    setMode(next);
    setPassword("");
    setShowPassword(false);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (!isSupabaseConfigured) {
      setError("Сервис входа недоступен");
      return;
    }

    setPending(true);
    try {
      if (mode === "register") {
        const result = await signUpWithPassword({
          email,
          password,
          fullName: name,
        });
        if (result.needsEmailConfirmation) {
          setInfo("Аккаунт создан. Проверьте email для подтверждения.");
          setPassword("");
          setMode("login");
          return;
        }
        // Session present — SessionGate switches to the app automatically.
        return;
      }

      await signInWithPassword(email, password);
    } catch (err: unknown) {
      setError(
        getAuthErrorMessage(err, mode === "register" ? "register" : "login"),
      );
    } finally {
      setPending(false);
    }
  }

  const canSubmitLogin = Boolean(email.trim() && password);
  const canSubmitRegister = Boolean(
    name.trim() && email.trim() && password.length >= 6,
  );
  const canSubmit = mode === "login" ? canSubmitLogin : canSubmitRegister;

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-20%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_60%)]"
      />

      <div className="relative w-full max-w-[380px]">
        <div className="mb-7 flex justify-center">
          <img
            src="/logo-dark.png"
            alt="Центр ИПК"
            className="h-9 w-auto object-contain"
          />
        </div>

        <div className="rounded-xl border border-border bg-card px-6 py-7 shadow-sm sm:px-8 sm:py-8">
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {mode === "login" ? "Вход в систему" : "Регистрация"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Введите данные аккаунта, чтобы продолжить."
                : "Заполните поля, чтобы создать аккаунт."}
            </p>
          </div>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {mode === "register" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-name">ФИО</Label>
                <Input
                  id="login-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  placeholder="Иванов Иван Иванович"
                  className="h-10"
                  required
                />
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                placeholder="name@company.com"
                className="h-10"
                aria-invalid={Boolean(error) || undefined}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="login-password">Пароль</Label>
                {mode === "login" ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setWipOpen(true)}
                  >
                    Забыли пароль?
                  </button>
                ) : null}
              </div>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                  placeholder={
                    mode === "register" ? "Не менее 6 символов" : "••••••••"
                  }
                  className="h-10 pr-10"
                  aria-invalid={Boolean(error) || undefined}
                  required
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword ? "Скрыть пароль" : "Показать пароль"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {error ? (
              <p
                className="-mt-1 text-[13px] leading-snug text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            {info ? (
              <p
                className="-mt-1 text-[13px] leading-snug text-muted-foreground"
                role="status"
              >
                {info}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="h-10 w-full"
              disabled={pending || !canSubmit}
            >
              {pending
                ? mode === "register"
                  ? "Регистрация…"
                  : "Вход…"
                : mode === "login"
                  ? "Войти"
                  : "Зарегистрироваться"}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                onClick={() => switchMode("register")}
              >
                Зарегистрироваться
              </button>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                onClick={() => switchMode("login")}
              >
                Войти
              </button>
            </>
          )}
        </p>
      </div>

      <Dialog open={wipOpen} onOpenChange={setWipOpen}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Скоро</DialogTitle>
            <DialogDescription>
              Функция в разработке. Мы сообщим, когда она станет доступна.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setWipOpen(false)}>
              Понятно
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
