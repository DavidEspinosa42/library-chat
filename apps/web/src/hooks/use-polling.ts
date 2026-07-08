import { useEffect, useRef } from "react";

/** Runs `fn` immediately and then every `intervalMs` while `active` is true. */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, active = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!active) return;
    void fnRef.current();
    const id = setInterval(() => void fnRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
}
