import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-muted">Documentos compartidos que se editan en tiempo real.</p>
        </div>
        {/* useSearchParams() necesita un límite de Suspense */}
        <Suspense fallback={<div className="h-[22rem] animate-pulse rounded-2xl border border-line bg-surface" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
