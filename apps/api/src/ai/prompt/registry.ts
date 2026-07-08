import { v1 } from "./v1.js";

/**
 * Versioned prompt registry (assessment 1.2 "prompt versioning"). The active
 * version is stamped on every message/extraction row — the audit trail.
 *
 * A v2 that spelled out cross-search citation numbering was trialled against
 * the eval set (docs/05) and reverted: it did not fix comparative per-cell
 * attribution and regressed the no-evidence template — the regression gate
 * working as intended. v1 remains active.
 */
const registry = { v1 } as const;

export type PromptVersion = keyof typeof registry;
export type PromptSet = (typeof registry)[PromptVersion];

export const ACTIVE_PROMPT_VERSION: PromptVersion = "v1";

export function getPromptSet(version: PromptVersion = ACTIVE_PROMPT_VERSION): PromptSet {
  return registry[version];
}

export type { RetrievedEntry, SourceRef } from "./v1.js";
