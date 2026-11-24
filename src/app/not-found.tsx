import Link from "next/link";
import { buttonStyles, cn } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-brand">404</p>
        <h1 className="mt-2 text-2xl font-bold">Página no encontrada</h1>
        <p className="mt-2 text-muted">El enlace no es válido o el documento ya no existe.</p>
        <Link href="/docs" className={cn(buttonStyles.base, buttonStyles.primary, "mt-6")}>
          Ir a mis documentos
        </Link>
      </div>
    </main>
  );
}
