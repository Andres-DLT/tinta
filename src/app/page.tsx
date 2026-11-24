import Link from "next/link";
import { Cloud, MousePointer2, ShieldCheck, Zap } from "lucide-react";
import { Logo, buttonStyles, cn } from "@/components/ui";

const features = [
  {
    icon: Zap,
    title: "Tiempo real de verdad",
    text: "Cada pulsación viaja por WebSocket y se fusiona con un CRDT (Yjs): sin conflictos aunque escribáis a la vez en la misma línea.",
  },
  {
    icon: MousePointer2,
    title: "Cursores en vivo",
    text: "Ve quién está en el documento, dónde tiene el cursor y qué está seleccionando.",
  },
  {
    icon: ShieldCheck,
    title: "Permisos claros",
    text: "Propietario, editor o lector. Invita por email o comparte un enlace de solo lectura.",
  },
  {
    icon: Cloud,
    title: "Guardado automático",
    text: "Todo se persiste en Supabase. Si pierdes la conexión, tus cambios se envían al volver.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonStyles.base, buttonStyles.ghost)}>
            Iniciar sesión
          </Link>
          <Link href="/docs" className={cn(buttonStyles.base, buttonStyles.primary)}>
            Mis documentos
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-6 py-12 lg:grid-cols-2">
        <section>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="size-1.5 rounded-full bg-success" /> Next.js · WebSockets · Supabase
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Escribe en equipo, <span className="text-brand">en tiempo real</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted text-pretty">
            Un editor de documentos ligero al estilo Google Docs: varias personas editando el mismo
            texto a la vez, con sincronización instantánea y cursores en vivo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login?mode=signup" className={cn(buttonStyles.base, buttonStyles.primary, "px-5 py-2.5")}>
              Crear cuenta gratis
            </Link>
            <Link href="/docs" className={cn(buttonStyles.base, buttonStyles.secondary, "px-5 py-2.5")}>
              Abrir mis documentos
            </Link>
          </div>
        </section>

        <EditorIllustration />
      </main>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, text }) => (
          <article key={title} className="rounded-2xl border border-line bg-surface p-5">
            <Icon className="mb-3 size-5 text-brand" aria-hidden />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

/** Ilustración estática de dos personas editando el mismo documento. */
function EditorIllustration() {
  return (
    <div aria-hidden className="relative rounded-2xl border border-line bg-surface p-6 shadow-xl shadow-black/5">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-3 w-40 rounded bg-surface-2" />
        <div className="flex -space-x-2">
          <span className="size-7 rounded-full bg-[#e11d48] ring-2 ring-surface" />
          <span className="size-7 rounded-full bg-[#059669] ring-2 ring-surface" />
          <span className="size-7 rounded-full bg-[#4f46e5] ring-2 ring-surface" />
        </div>
      </div>
      <div className="space-y-4 font-serif">
        <p className="text-2xl font-bold">Plan del trimestre</p>
        <p className="leading-relaxed text-muted">
          Objetivos: lanzar la versión móvil
          <span className="relative mx-px inline-block h-5 border-l-2 border-[#e11d48] align-middle">
            <span className="absolute -top-5 left-[-2px] rounded rounded-bl-none bg-[#e11d48] px-1.5 py-px font-sans text-[10px] font-semibold whitespace-nowrap text-white">
              Lucía
            </span>
          </span>{" "}
          y mejorar la retención un 15%.
        </p>
        <p className="leading-relaxed text-muted">
          <span className="bg-[#059669]/20">Responsables: equipo de producto</span>
          <span className="relative mx-px inline-block h-5 border-l-2 border-[#059669] align-middle">
            <span className="absolute -top-5 left-[-2px] rounded rounded-bl-none bg-[#059669] px-1.5 py-px font-sans text-[10px] font-semibold whitespace-nowrap text-white">
              Marcos
            </span>
          </span>{" "}
          y diseño.
        </p>
        <div className="space-y-2 pt-2">
          <div className="h-2.5 w-full rounded bg-surface-2" />
          <div className="h-2.5 w-11/12 rounded bg-surface-2" />
          <div className="h-2.5 w-3/5 rounded bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
