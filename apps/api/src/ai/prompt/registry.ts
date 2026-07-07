import { v1 } from "./v1.js";

/**
 * Versioned prompt registry (assessment 1.2 "prompt versioning"). The active
 * version is stamped on every message/extraction row — the audit trail.
 */
const registry = { v1 } as const;

export type PromptVersion = keyof typeof registry;
export type PromptSet = (typeof registry)[PromptVersion];

export const ACTIVE_PROMPT_VERSION: PromptVersion = "v1";

export function getPromptSet(version: PromptVersion = ACTIVE_PROMPT_VERSION): PromptSet {
  return registry[version];
}

export type { RetrievedEntry, SourceRef } from "./v1.js";
