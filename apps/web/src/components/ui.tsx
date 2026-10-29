import clsx from "clsx";
import { ChevronLeft, LoaderCircle, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-card hover:brightness-105",
  secondary: "bg-surface text-ink border border-line shadow-card hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-accent-soft text-accent hover:brightness-95",
};

const buttonClass = (variant: Variant, size: "sm" | "md" | "lg") =>
  clsx(
    "press inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap select-none",
    "disabled:opacity-40 disabled:pointer-events-none",
    size === "sm" && "h-9 px-4 text-[13px]",
    size === "md" && "h-12 px-6 text-[15px]",
    size === "lg" && "h-14 px-7 text-[17px]",
    variants[variant],
  );

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      className={clsx(buttonClass(variant, size), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : children}
    </button>
  );
}

export function LinkButton({
  to,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  to: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={clsx(buttonClass(variant, size), "shrink-0", className)}>
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        "press grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-2",
        "disabled:opacity-40 disabled:pointer-events-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const headerButtonClass = (tone: "plain" | "accent") =>
  clsx(
    "press grid size-10 shrink-0 place-items-center rounded-full shadow-card",
    tone === "accent" ? "bg-accent text-accent-ink" : "border border-line/70 bg-surface text-ink",
  );

/** Round button for the top bar of a page (same look as the back button). */
export function HeaderButton({
  label,
  tone = "plain",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "plain" | "accent" }) {
  return (
    <button type="button" aria-label={label} title={label} className={clsx(headerButtonClass(tone), className)} {...props}>
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-[22px] border border-line/70 bg-surface shadow-card", className)}>{children}</div>
  );
}

/** iOS-style grouped list: one card, rows separated by hairlines. */
export function List({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        "divide-y divide-line/80 overflow-hidden rounded-[22px] border border-line/70 bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pb-2">
      <h2 className="flex items-center gap-2 text-[13px] font-bold tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "voice" | "breath" | "ok";
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "voice" && "bg-voice-soft text-voice",
        tone === "breath" && "bg-breath-soft text-breath",
        tone === "ok" && "bg-ok-soft text-ok",
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx("size-6 animate-spin text-muted", className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50dvh] place-items-center">
      <Spinner className="size-8" />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  action?: ReactNode;
}) {
  return (
    <header className="pt-3 pb-4">
      {(back || action) && (
        <div className="mb-3 flex h-10 items-center justify-between">
          {back ? (
            <Link to={back} aria-label="Back" className={clsx(headerButtonClass("plain"), "-ml-1")}>
              <ChevronLeft className="size-5" />
            </Link>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">{action}</div>
        </div>
      )}
      <h1 className={clsx("text-[28px] leading-tight font-extrabold tracking-tight", !back && !action && "pt-4")}>
        {title}
      </h1>
      {subtitle && <p className="mt-0.5 truncate text-[15px] text-muted">{subtitle}</p>}
    </header>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-surface-2 text-muted">{icon}</div>
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on wider screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal>
      <div className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-surface shadow-2xl sm:max-w-lg sm:rounded-[28px]">
        <div className="mx-auto mt-2 h-1.5 w-9 rounded-full bg-line sm:hidden" />
        <div className="flex items-center gap-2 px-5 pt-3 pb-2">
          <h2 className="flex-1 text-[17px] font-bold">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2 size-9 bg-surface-2">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="pb-safe overflow-y-auto px-5">
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="px-1 text-[13px] font-bold text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="px-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-transparent bg-surface-2 px-4 py-3 text-ink placeholder:text-muted/60 outline-none transition focus:border-voice/50 focus:bg-surface focus:ring-4 focus:ring-voice/10";

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={clsx(inputClass, "min-h-24 resize-y", className)} {...props} />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="flex rounded-full bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "press h-9 flex-1 rounded-full px-3 text-[13px] font-bold transition-colors",
            value === o.value ? "bg-surface text-ink shadow-card" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type Toast = { id: number; message: string; tone: "ok" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "animate-pop rounded-full px-5 py-3 text-sm font-bold shadow-lift",
              t.tone === "ok" ? "bg-ink text-bg" : "bg-accent text-accent-ink",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
