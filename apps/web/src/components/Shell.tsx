import clsx from "clsx";
import { House, Library, Mic, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, NavLink, Outlet } from "react-router";
import { useMe } from "../lib/queries";

function Tab({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          "press flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-bold transition-colors",
          isActive ? "text-brand" : "text-muted",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function Shell() {
  const { data: me } = useMe();
  const admin = me?.role === "admin";
  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-2xl flex-col">
      <main className="flex-1 px-4 pb-28">
        <Outlet />
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl gap-1 px-3 py-1.5">
          <Tab to="/" end icon={<House className="size-6" />} label="ホーム" />
          {admin && <Tab to="/admin" icon={<Library className="size-6" />} label="Content" />}
          {admin && <Tab to="/admin/record" icon={<Mic className="size-6" />} label="Record" />}
          <Tab to="/account" icon={<UserRound className="size-6" />} label="アカウント" />
        </div>
      </nav>
    </div>
  );
}

export function RequireAdmin() {
  const { data: me } = useMe();
  return me?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}
