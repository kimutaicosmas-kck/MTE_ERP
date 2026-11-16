/** Infer list parent for Android-style back from a detail URL (e.g. /sales/abc → /sales). */
export function mobileBackTarget(pathname: string): string | undefined {
  if (!pathname || pathname === "/" || pathname === "/login" || pathname === "/more") return undefined;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1) return "/";
  const [mod, second, ...rest] = parts;
  const looksLikeId = second && (second.length >= 8 || /^[a-z0-9]{20,}$/i.test(second));
  if (looksLikeId) return `/${mod}`;
  if (rest.length > 0) return `/${mod}/${second}`;
  return `/${mod}`;
}

export function shouldShowMobileBack(pathname: string, explicitBack?: string): string | undefined {
  return explicitBack || mobileBackTarget(pathname);
}