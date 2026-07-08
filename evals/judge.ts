import { getJudgeModel } from "../apps/api/src/ai/llm/factory.js";
import { getPromptSet } from "../apps/api/src/ai/prompt/registry.js";

export interface JudgeVerdict {
  faithful: boolean;
  reason: string;
}

/**
 * LLM-as-judge faithfulness check (docs/02): grades the answer only against the
 * chunks it actually cited. Runs on the live JUDGE_MODEL (Sonnet 5) — stronger
 * than the judged model to avoid self-preference bias.
 */
export async function judgeFaithfulness(
  question: string,
  answer: string,
  citedSnippets: string[],
): Promise<JudgeVerdict> {
  const model = await getJudgeModel();
  const prompt = getPromptSet().buildJudgePrompt(question, answer, citedSnippets);

  // The judge is infrastructure, not the model under test: a transient empty /
  // non-JSON response should be retried, not scored as an unfaithful answer.
  let lastText = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await model.invoke(prompt);
    lastText =
      typeof response.content === "string"
        ? response.content
        : response.content.map((b) => (b.type === "text" ? b.text : "")).join("");

    const start = lastText.indexOf("{");
    const end = lastText.lastIndexOf("}");
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(lastText.slice(start, end + 1)) as Partial<JudgeVerdict>;
      return {
        faithful: parsed.faithful === true,
        reason: typeof parsed.reason === "string" ? parsed.reason : "(no reason)",
      };
    }
  }
  throw new Error(`Judge returned no JSON after 3 attempts: "${lastText.slice(0, 80)}"`);
}
