import clsx from "clsx";
import { House, Library, Mic, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { useMe } from "../lib/queries";

function Tab({
  to,
  icon,
  label,
  match,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  match: (path: string) => boolean;
}) {
  const active = match(useLocation().pathname);
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "press flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10px] font-bold transition-colors",
        active ? "bg-accent-soft text-accent" : "text-muted",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export function Shell() {
  const { data: me } = useMe();
  const admin = me?.role === "admin";
  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-2xl flex-col">
      <main className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
        <Outlet />
      </main>
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div
          className={clsx(
            "pointer-events-auto mx-auto flex gap-1 rounded-full border border-line/70 bg-surface/80 p-1.5 shadow-lift backdrop-blur-xl backdrop-saturate-150",
            admin ? "max-w-md" : "max-w-60",
          )}
        >
          <Tab
            to="/"
            icon={<House className="size-[22px]" />}
            label="ホーム"
            match={(p) => p === "/" || p.startsWith("/chapters/")}
          />
          {admin && (
            <Tab
              to="/admin"
              icon={<Library className="size-[22px]" />}
              label="Content"
              match={(p) => p === "/admin" || p.startsWith("/admin/chapters/")}
            />
          )}
          {admin && (
            <Tab
              to="/admin/record"
              icon={<Mic className="size-[22px]" />}
              label="Record"
              match={(p) => p === "/admin/record"}
            />
          )}
          <Tab
            to="/account"
            icon={<UserRound className="size-[22px]" />}
            label="アカウント"
            match={(p) => p === "/account"}
          />
        </div>
      </nav>
    </div>
  );
}

export function RequireAdmin() {
  const { data: me } = useMe();
  return me?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}
