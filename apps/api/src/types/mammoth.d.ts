/** Minimal surface of mammoth (ships no types). Verified against lib/index.js 1.12.0. */
declare module "mammoth" {
  export interface MammothResult {
    value: string;
    messages: { type: string; message: string }[];
  }
  export function convertToHtml(input: { buffer: Buffer }): Promise<MammothResult>;
  export function extractRawText(input: { buffer: Buffer }): Promise<MammothResult>;
}
