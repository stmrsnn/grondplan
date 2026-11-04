"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastApi {
  show: (message: string) => void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });

/** Korte melding onderaan in het midden, verdwijnt vanzelf. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ text, key: Date.now() });
    timer.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
      >
        {msg && (
          <div
            key={msg.key}
            className="rounded-[var(--radius-control)] bg-ink px-4 py-2 text-sm text-bg shadow-[var(--shadow-float)]"
          >
            {msg.text}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
