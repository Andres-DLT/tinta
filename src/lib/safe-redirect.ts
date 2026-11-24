/** Evita redirecciones abiertas: solo rutas internas absolutas. */
export function safeNextPath(value: unknown, fallback = "/docs"): string {
  const path = typeof value === "string" ? value : "";
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}
