/**
 * A clickable starter question (document card + chat empty state).
 * `compact` is the smaller variant used inside the document card grid.
 */
export function StarterQuestion({
  question,
  onClick,
  compact = false,
}: {
  question: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="Start from this question"
      className={`h-full w-full rounded-lg border border-stone-200 text-left leading-relaxed text-stone-700 transition-colors hover:border-pine-600 hover:bg-pine-50 ${
        compact ? "bg-paper px-3 py-2 text-xs" : "bg-white px-3.5 py-2.5 text-sm"
      }`}
    >
      {question}
    </button>
  );
}
