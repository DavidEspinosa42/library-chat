import type { ButtonHTMLAttributes } from "react";

/** Primary pine action button. Pass sizing (padding/width) via `className`. */
export function PrimaryButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-pine-700 text-sm font-semibold text-white transition-colors hover:bg-pine-800 disabled:opacity-50 ${className}`}
    />
  );
}
