import { useEffect, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import "./App.css";
import { initSession, useSession, useSessionStatus } from "@/entities/session";
import { isSupabaseConfigured } from "@/shared/api/supabase";
import { LoginPage } from "@/pages/login";
import { AppRoutes } from "./routing";

function SessionGate({ children }: { children: ReactNode }) {
  const status = useSessionStatus();
  const session = useSession();

  useEffect(() => {
    void initSession();
  }, []);

  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionGate>
        <AppRoutes />
      </SessionGate>
    </BrowserRouter>
  );
}
