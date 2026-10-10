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
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink shadow-card hover:brightness-105",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-brand-soft text-brand hover:brightness-95",
};

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
      className={clsx(
        "press inline-flex items-center justify-center gap-2 rounded-2xl font-bold select-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-12 px-5",
        size === "lg" && "h-14 px-6 text-lg",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : children}
    </button>
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

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-3xl bg-surface shadow-card border border-line/60", className)}>
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "indigo" | "gold" | "ok";
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "brand" && "bg-brand-soft text-brand",
        tone === "indigo" && "bg-indigo-soft text-indigo",
        tone === "gold" && "bg-gold-soft text-gold",
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
    <header className="flex items-center gap-1 pt-4 pb-3">
      {back && (
        <Link
          to={back}
          aria-label="Back"
          className="press -ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2"
        >
          <ChevronLeft className="size-6" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
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
      <div className="animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[2rem] bg-surface shadow-2xl sm:max-w-lg sm:rounded-[2rem]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center gap-2 px-5 pt-3 pb-2">
          <h2 className="flex-1 text-lg font-extrabold">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
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
      <label htmlFor={id} className="text-sm font-bold text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-line bg-bg px-4 py-3 text-ink placeholder:text-muted/60 outline-none transition focus:border-indigo focus:ring-4 focus:ring-indigo/15";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
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
    <div className="flex rounded-2xl bg-surface-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "press h-10 flex-1 rounded-xl px-3 text-sm font-bold transition-colors",
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
              "animate-pop rounded-2xl px-4 py-3 text-sm font-bold shadow-card",
              t.tone === "ok" ? "bg-ink text-bg" : "bg-brand text-brand-ink",
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
