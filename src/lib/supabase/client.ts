import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

/** Cliente de Supabase para componentes de cliente (singleton en el navegador). */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey);
}
