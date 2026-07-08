import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** GFM markdown (tables for comparative answers — docs/02 pillar 3). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-sm max-w-none [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-stone-300 [&_td]:p-1.5 [&_th]:border [&_th]:border-stone-300 [&_th]:bg-stone-100 [&_th]:p-1.5 [&_th]:text-left [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_a]:text-pine-700 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-stone-300 [&_blockquote]:pl-3 [&_blockquote]:text-stone-600">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
