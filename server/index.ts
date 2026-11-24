import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { consoleLogger, createCollabServer } from "./collab-server";
import { createSupabaseBackend } from "./supabase-backend";

// En desarrollo reutilizamos el mismo .env.local que Next.js.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // el archivo no existe: usamos las variables del entorno
  }
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  console.error(`[collab] Falta la variable de entorno ${names.join(" o ")}`);
  process.exit(1);
}

const supabaseUrl = requireEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const secretKey = requireEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
const port = Number(process.env.PORT ?? process.env.COLLAB_PORT ?? 1234);
const host = process.env.COLLAB_HOST ?? "0.0.0.0";
const allowedOrigins = (process.env.COLLAB_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const supabase = createClient<Database>(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { authorize, persistence, getRoles } = createSupabaseBackend(supabase);
const server = createCollabServer({
  authorize,
  persistence,
  getRoles,
  allowedOrigins,
  logger: consoleLogger,
});

server
  .listen(port, host)
  .then((actualPort) => {
    consoleLogger.info(`Servidor de colaboración escuchando en ws://${host}:${actualPort}`, {
      allowedOrigins: allowedOrigins.length ? allowedOrigins : "cualquiera",
    });
  })
  .catch((err) => {
    consoleLogger.error("No se pudo iniciar el servidor", { error: String(err) });
    process.exit(1);
  });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  consoleLogger.info(`Recibido ${signal}: guardando documentos y cerrando…`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
