/**
 * The single same-origin API client for the IAM console (replaces the per-page `api()` copies).
 * All calls go through the Next.js `/api` BFF proxy with the session cookie; a 401 throws an
 * `ApiError` with status 401 so callers can route the user back to sign-in.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get unauthorised() {
    return this.status === 401;
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) throw new ApiError("Your session has expired.", 401);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message)
      ? body.message.join(", ")
      : (body.message ?? `HTTP ${res.status}`);
    throw new ApiError(msg, res.status);
  }
  return (res.status === 204 ? (null as T) : ((await res.json()) as T));
}
