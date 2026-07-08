import { useEffect, useRef, useState } from "react";
import type { CitationDto } from "@library-chat/shared";

/**
 * Citation chips for one answer. Exactly one popover can be open at a time;
 * clicking anywhere outside closes it.
 */
export function CitationList({ citations }: { citations: CitationDto[] }) {
  const [openN, setOpenN] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openN === null) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpenN(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenN(null);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openN]);

  return (
    <div ref={containerRef} className="mt-2 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2">
      {citations.map((citation) => (
        <CitationChip
          key={citation.n}
          citation={citation}
          open={openN === citation.n}
          onToggle={() => setOpenN(openN === citation.n ? null : citation.n)}
        />
      ))}
    </div>
  );
}

function CitationChip({
  citation,
  open,
  onToggle,
}: {
  citation: CitationDto;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="relative inline-block">
      <button
        data-testid="citation-chip"
        onClick={onToggle}
        aria-expanded={open}
        className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold transition-colors ${
          open ? "bg-brass-800 text-white" : "bg-brass-100 text-brass-800 hover:bg-brass-200"
        }`}
      >
        [{citation.n}] {citation.documentTitle}
        {citation.location ? ` · ${citation.location}` : ""}
      </button>
      {open && (
        <span className="absolute bottom-full left-0 z-10 mb-1.5 block max-h-72 w-[30rem] max-w-[82vw] overflow-y-auto rounded-lg border border-stone-300 bg-white p-4 text-sm shadow-xl">
          <span className="mb-1.5 block font-semibold text-ink">
            {citation.documentTitle}
            {citation.location ? ` · ${citation.location}` : ""}
          </span>
          <span className="font-display block text-[15px] italic leading-relaxed text-stone-700">
            “{citation.snippet}”
          </span>
        </span>
      )}
    </span>
  );
}
