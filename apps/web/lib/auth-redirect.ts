export const DEFAULT_AUTH_REDIRECT_PATH = "/booking";

export const DEFAULT_ADMIN_REDIRECT_PATH = "/dashboard";

export function sanitizeNextPath(input: string | null | undefined): string {
  if (!input) return DEFAULT_AUTH_REDIRECT_PATH;

  const value = input.trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  try {
    const candidate = new URL(value, "https://barberia.local");
    if (candidate.origin !== "https://barberia.local") {
      return DEFAULT_AUTH_REDIRECT_PATH;
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }
}

/**
 * Login URL for admin pages (design D1). Wraps `sanitizeNextPath` so the
 * `next` param only carries safe internal paths; when the `x-pathname` header
 * is absent (direct navigation) or unsafe, it falls back to `/dashboard`.
 */
export function adminLoginPath(pathname: string | null | undefined): string {
  const next = sanitizeNextPath(pathname);
  const target = next === DEFAULT_AUTH_REDIRECT_PATH ? DEFAULT_ADMIN_REDIRECT_PATH : next;
  return `/login?next=${encodeURIComponent(target)}`;
}
