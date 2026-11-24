import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

const PROTECTED_PREFIXES = ["/docs"];
const AUTH_PAGES = ["/login"];

/**
 * Refresca la sesión de Supabase (rota el token si caducó) y protege rutas.
 * Se ejecuta en `src/proxy.ts` antes de renderizar cada página.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Evita que una CDN cachee respuestas que llevan cookies de sesión.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Importante: no metas lógica entre createServerClient y getClaims().
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    const [pathOnly, query] = path.split("?");
    url.pathname = pathOnly;
    url.search = query ? `?${query}` : "";
    const redirect = NextResponse.redirect(url);
    // Conserva las cookies de sesión refrescadas.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response.headers.forEach((value, key) => {
      if (key !== "location" && key !== "set-cookie") redirect.headers.set(key, value);
    });
    return redirect;
  };

  if (!isLoggedIn && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (isLoggedIn && AUTH_PAGES.includes(pathname)) {
    return redirectTo("/docs");
  }

  return response;
}
