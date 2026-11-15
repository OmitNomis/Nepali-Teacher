import clsx from "clsx";
import { ChartColumn, House, Library, Mic, UserRound, type LucideIcon } from "lucide-react";
import { Link, Navigate, Outlet, useLocation } from "react-router";
import { useMe } from "../lib/queries";

// Only admins get navigation: the learner moves between home, a chapter and
// the quiz, and reaches her account from the avatar on home.
const TABS: { to: string; label: string; icon: LucideIcon; match: (path: string) => boolean }[] = [
  { to: "/", label: "Learn", icon: House, match: (p) => p === "/" || p.startsWith("/chapters/") },
  { to: "/admin", label: "Content", icon: Library, match: (p) => p === "/admin" || p.startsWith("/admin/chapters/") },
  { to: "/admin/record", label: "Record", icon: Mic, match: (p) => p === "/admin/record" },
  { to: "/admin/progress", label: "Progress", icon: ChartColumn, match: (p) => p === "/admin/progress" },
  { to: "/account", label: "Account", icon: UserRound, match: (p) => p === "/account" },
];

/** Bottom tab bar on phones and tablets. */
function TabBar({ path }: { path: string }) {
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <div className="mx-auto flex h-14 max-w-lg">
        {TABS.map(({ to, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition-colors",
                active ? "text-ink" : "text-muted",
              )}
            >
              <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Sidebar on wide screens. */
function SideBar({ path }: { path: string }) {
  return (
    <nav className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface px-3 py-6 lg:flex">
      <p lang="ne" className="px-3 pb-6 text-[26px] leading-none">
        नमस्ते
      </p>
      {TABS.map(({ to, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors",
              active ? "bg-surface-2 font-bold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell() {
  const { data: me } = useMe();
  const { pathname } = useLocation();
  const admin = me?.role === "admin";
  return (
    // --nav-h / --nav-w: room the navigation takes, for anything pinned to the screen edges
    <div
      className={clsx(
        "min-h-dvh [--nav-h:0px] [--nav-w:0px]",
        admin && "[--nav-h:3.5rem] lg:[--nav-h:0px] lg:[--nav-w:15rem]",
      )}
    >
      {admin && <SideBar path={pathname} />}
      <div className="lg:pl-[var(--nav-w)]">
        <main className="pt-safe mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+2.5rem)] sm:px-8">
          <Outlet />
        </main>
      </div>
      {admin && <TabBar path={pathname} />}
    </div>
  );
}

export function RequireAdmin() {
  const { data: me } = useMe();
  return me?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}
