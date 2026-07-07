import { z } from "zod";

/** Stable API error codes — see docs/04-api-contract.md before adding one. */
export const apiErrorCodeSchema = z.enum([
  "VALIDATION",
  "UNAUTHORIZED",
  "INVALID_CREDENTIALS",
  "NOT_FOUND",
  "EMAIL_TAKEN",
  "DOCUMENT_NOT_READY",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_FORMAT",
  "RATE_LIMITED",
  "INTERNAL",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Every error response, everywhere, uses this envelope. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
