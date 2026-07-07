import type { ApiErrorCode } from "@library-chat/shared";

const CODE_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  DOCUMENT_NOT_READY: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Throwable domain error mapped to the envelope by the global error handler. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = CODE_STATUS[code];
  }
}
