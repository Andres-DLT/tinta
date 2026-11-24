/**
 * Variables de entorno públicas (se incrustan en el bundle del navegador).
 * Next.js solo sustituye accesos literales a `process.env.NEXT_PUBLIC_*`.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env.local y rellénala.`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseKey() {
    return required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
  get collabUrl() {
    return process.env.NEXT_PUBLIC_COLLAB_URL || "ws://localhost:1234";
  },
};
