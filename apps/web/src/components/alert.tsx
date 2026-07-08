import type { ReactNode } from "react";

/** Inline error notice (`role="alert"` so screen readers announce it). */
export function ErrorAlert({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p role="alert" className={`rounded bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}>
      {children}
    </p>
  );
}
