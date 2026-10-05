import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------ reveal */

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("reveal", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ panels */

export function Panel({
  title,
  code,
  right,
  children,
  className,
  bodyClass,
}: {
  title?: string;
  code?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("panel relative overflow-hidden rounded-sm", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-signal-500/60 to-transparent" />
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/8 bg-ink-950/40 px-4 py-2.5">
          <div className="flex items-baseline gap-3 min-w-0">
            {code && (
              <span className="hud-num shrink-0 rounded-[2px] bg-signal-500 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">
                {code}
              </span>
            )}
            {title && <h2 className="sign truncate text-[13px] font-semibold text-mist-100">{title}</h2>}
          </div>
          {right}
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "amber" | "good" | "bad";
  hint?: string;
}) {
  const toneClass = {
    default: "text-mist-100",
    amber: "text-signal-400",
    good: "text-lgreen",
    bad: "text-lred",
  }[tone];
  return (
    <div className="group relative min-w-0 rounded-sm border border-white/8 bg-ink-950/50 px-3 py-2 transition-colors hover:border-signal-500/50">
      <div className="sign text-[9.5px] text-mist-500 transition-colors group-hover:text-signal-400">{label}</div>
      <div className={cn("hud-num truncate text-xl leading-tight font-semibold", toneClass)} title={hint}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-normal text-mist-400">{unit}</span>}
      </div>
    </div>
  );
}

export function LineBadge({
  id,
  color,
  size = "md",
  className,
}: {
  id: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = {
    sm: "h-4 min-w-4 px-1 text-[9px]",
    md: "h-5 min-w-5 px-1.5 text-[10.5px]",
    lg: "h-7 min-w-7 px-2 text-sm",
  }[size];
  return (
    <span
      className={cn("sign inline-flex items-center justify-center rounded-[3px] font-bold text-ink-950", dims, className)}
      style={{ backgroundColor: color }}
    >
      {id}
    </span>
  );
}

/* ---------------------------------------------------------------- controls */

export function Btn({
  children,
  onClick,
  variant = "ghost",
  size = "md",
  className,
  disabled,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "solid" | "ghost" | "danger" | "outline";
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const variants = {
    solid: "bg-signal-500 text-ink-950 hover:bg-signal-400 border-signal-500 shadow-[0_0_24px_-8px_rgba(242,164,31,.9)]",
    ghost: "bg-ink-700/60 text-mist-200 hover:bg-ink-600 hover:text-mist-50 border-white/10",
    outline: "bg-transparent text-mist-300 hover:text-signal-400 border-white/15 hover:border-signal-500/60",
    danger: "bg-lred/15 text-lred hover:bg-lred/25 border-lred/40",
  }[variant];
  const sizes = { sm: "px-2 py-1 text-[10.5px]", md: "px-3 py-1.5 text-[11.5px]" }[size];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "sign inline-flex items-center gap-1.5 rounded-[3px] border font-semibold transition-all duration-150 active:translate-y-px",
        variants,
        sizes,
        disabled && "cursor-not-allowed opacity-35 hover:!bg-ink-700/60",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="sign mb-1 block text-[9.5px] text-mist-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-mono text-[10px] text-mist-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[3px] border border-white/12 bg-ink-950/70 px-2 py-1.5 font-mono text-[12px] text-mist-100 outline-none transition-colors placeholder:text-mist-500/70 focus:border-signal-500 focus:bg-ink-900";

export function Select({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "cursor-pointer", className)}>
      {children}
    </select>
  );
}

/* ------------------------------------------------------------------ tables */

export function PaperCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("paper rounded-sm border border-black/10 shadow-[0_20px_50px_-30px_rgba(0,0,0,.9)]", className)}>{children}</div>;
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cn("sign border-b border-black/20 bg-black/5 px-2 py-1.5 text-left text-[9.5px] text-ink-700", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-black/8 px-2 py-1 font-mono text-[11px] text-ink-800", className)}>{children}</td>;
}

/* -------------------------------------------------------------- misc bits */

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-white/15 bg-ink-950 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
      {children}
    </kbd>
  );
}

export function Blink({ on }: { on: boolean }) {
  return (
    <span className={cn("inline-block h-1.5 w-1.5 rounded-full transition-colors", on ? "bg-lgreen shadow-[0_0_8px_2px_rgba(47,190,124,.6)]" : "bg-ink-500")} />
  );
}

/** Counts up to a target value whenever the target changes — cheap "live" feel. */
export function useCountUp(target: number, ms = 420): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = target;
    if (a === b) return;
    let raf = 0;
    const stepFn = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(a + (b - a) * eased);
      if (p < 1) raf = requestAnimationFrame(stepFn);
      else from.current = b;
    };
    raf = requestAnimationFrame(stepFn);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
