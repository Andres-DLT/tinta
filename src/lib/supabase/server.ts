import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Crea uno nuevo por petición (nunca lo compartas entre peticiones).
 */
export async function createClient() {
  // supabase-js comprueba la caducidad del JWT con Date.now(): con Cache
  // Components hay que esperar a una petición real antes de usarlo.
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: no puede escribir cookies.
          // No pasa nada: proxy.ts refresca la sesión en cada petición.
        }
      },
    },
  });
}
