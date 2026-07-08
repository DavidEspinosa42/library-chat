import type { ApiError } from "@library-chat/shared";

/** Thrown for any non-2xx response — carries the envelope's stable code (docs/04). */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) {
    let code = "INTERNAL";
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as ApiError;
      code = body.error.code;
      message = body.error.message;
    } catch {
      // non-envelope error body — keep defaults
    }
    if (code === "UNAUTHORIZED" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiRequestError(res.status, code, message);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      ...(body !== undefined
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    }),
  upload: <T>(path: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    return request<T>(path, { method: "POST", body: form });
  },
};
