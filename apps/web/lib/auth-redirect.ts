export const DEFAULT_AUTH_REDIRECT_PATH = "/booking";

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
