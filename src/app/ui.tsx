import * as React from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*            Swipe to close: 1:1 with the finger, a flick is enough           */
/* -------------------------------------------------------------------------- */

export function useDragToClose(ref: React.RefObject<HTMLElement | null>, axis: "x" | "y", open: boolean, close: () => void) {
  const closeRef = React.useRef(close);
  closeRef.current = close;
  const openRef = React.useRef(open);
  openRef.current = open;

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    type S = { p0: number; o0: number; active: boolean; hist: { d: number; t: number }[]; size: number };
    let s: S | null = null;
    const pos = (t: Touch) => (axis === "y" ? t.clientY : t.clientX);
    const other = (t: Touch) => (axis === "y" ? t.clientX : t.clientY);
    const set = (d: number) => (el.style.transform = axis === "y" ? `translateY(${d}px)` : `translateX(${d}px)`);
    const band = (o: number, dim: number) => -(Math.abs(o) * dim * 0.55) / (dim + 0.55 * Math.abs(o));
    const start = (e: TouchEvent) => {
      if (!openRef.current || e.touches.length > 1 || (e.target as Element).closest("input,textarea,select")) return;
      const t = e.touches[0];
      s = { p0: pos(t), o0: other(t), active: false, hist: [], size: axis === "y" ? el.offsetHeight : el.offsetWidth };
    };
    const move = (e: TouchEvent) => {
      if (!s) return;
      const t = e.touches[0];
      const d = pos(t) - s.p0;
      const od = other(t) - s.o0;
      if (!s.active) {
        if (Math.abs(d) < 10 && Math.abs(od) < 10) return;
        const along = Math.abs(d) > Math.abs(od);
        const atTop = axis === "y" ? el.scrollTop <= 0 : true;
        if (!along || d < 0 || !atTop) {
          s = null;
          return;
        }
        s.active = true;
        s.p0 = pos(t);
        el.classList.add("dragging");
      }
      e.preventDefault();
      const dd = pos(t) - s.p0;
      set(dd >= 0 ? dd : band(dd, s.size));
      s.hist.push({ d: dd, t: e.timeStamp });
      if (s.hist.length > 5) s.hist.shift();
    };
    const end = () => {
      if (!s) return;
      const st = s;
      s = null;
      if (!st.active) return;
      el.classList.remove("dragging");
      const h = st.hist;
      const last = h[h.length - 1] || { d: 0, t: 0 };
      const first = h[0] || last;
      const v = (last.d - first.d) / Math.max(1, last.t - first.t);
      el.style.transform = "";
      if (last.d > st.size / 3 || v > 0.11) closeRef.current();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [ref, axis]);
}

/* -------------------------------------------------------------------------- */
/*                                 Bottom sheet                               */
/* -------------------------------------------------------------------------- */

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useDragToClose(ref, "y", open, onClose);
  React.useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = 0;
  }, [open, children]);
  return (
    <>
      <div className={cn("veil veil2", open && "on")} onClick={onClose} />
      <div ref={ref} className={cn("sheet", open && "on")} role="dialog" aria-modal="true">
        <div className="grab" />
        {children}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Toast                                   */
/* -------------------------------------------------------------------------- */

const ToastCtx = React.createContext<(msg: string) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = React.useState("");
  const [on, setOn] = React.useState(false);
  const timer = React.useRef(0);
  const show = React.useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(false), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={cn("toast", on && "on")} role="status">{msg}</div>
    </ToastCtx.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Bits                                     */
/* -------------------------------------------------------------------------- */

/** Photo that fades in once loaded. */
export function Img({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = React.useState(false);
  if (!src) return null;
  return <img src={src} alt={alt} className={loaded ? "in" : ""} onLoad={() => setLoaded(true)} />;
}

/** Button that shows a spinner while its action runs. */
export function BusyButton({ onRun, className, children, ...rest }: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & { onRun: () => Promise<void> | void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      {...rest}
      className={className}
      disabled={busy || rest.disabled}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await onRun();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="spin" /> : children}
    </button>
  );
}

/** Two-tap confirm for destructive buttons. */
export function useArmed() {
  const [armed, setArmed] = React.useState<string | null>(null);
  return {
    armed,
    arm: (k: string) => {
      if (armed === k) return true;
      setArmed(k);
      return false;
    },
    reset: () => setArmed(null),
  };
}

export const errMsg = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/^Error:\s*/, "");

export const ChevronBack = () => (
  <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
    <path d="M10 2 2 10l8 8" fill="none" stroke="#1C1A17" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Burger = () => (
  <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
    <path d="M1 1h20M1 8h20M1 15h20" stroke="#1C1A17" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const Cross = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 2l12 12M14 2 2 14" stroke="#1C1A17" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
export const Chevron = () => (
  <svg className="chev" width="14" height="9" viewBox="0 0 14 9" aria-hidden="true">
    <path d="M1 1.5 7 7.5l6-6" fill="none" stroke="#1C1A17" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Lock = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
    <rect x="1" y="7" width="12" height="8" rx="2" fill="none" stroke="#4A443B" strokeWidth="1.4" />
    <path d="M4 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="#4A443B" strokeWidth="1.4" />
  </svg>
);
