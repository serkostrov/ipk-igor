import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/settings" replace />} />
      {/* Single splat keeps AppShell mounted across in-app navigations. */}
      <Route path="/*" element={<AppShell />} />
    </Routes>
  );
}
