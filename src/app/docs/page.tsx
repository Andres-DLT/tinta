import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button, Logo } from "@/components/ui";
import { UserMenu, UserMenuSkeleton } from "@/components/user-menu";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createDocument } from "./actions";
import { DocumentGrid, type DocumentSummary } from "./document-grid";
import { RealtimeRefresh } from "./realtime-refresh";

export const metadata: Metadata = { title: "Mis documentos" };

export default function DocumentsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Logo href="/docs" />
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Documentos</h1>
            <p className="mt-1 text-sm text-muted">Tus documentos y los que otras personas han compartido contigo.</p>
          </div>
          <form action={createDocument}>
            <Button type="submit">
              <Plus className="size-4" aria-hidden /> Nuevo documento
            </Button>
          </form>
        </div>

        <Suspense fallback={<DocumentGridSkeleton />}>
          <DocumentList />
        </Suspense>
      </main>
    </div>
  );
}

async function DocumentList() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("document_members")
    .select("role, documents(id, title, content_preview, updated_at, owner:profiles(display_name, color))")
    .eq("user_id", user.id);

  if (error) {
    return (
      <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
        No se pudieron cargar los documentos: {error.message}
      </p>
    );
  }

  const documents: DocumentSummary[] = (data ?? [])
    .flatMap(({ role, documents: doc }) =>
      doc
        ? [
            {
              id: doc.id,
              title: doc.title,
              preview: doc.content_preview,
              updatedAt: doc.updated_at,
              role,
              ownerName: doc.owner?.display_name ?? "Desconocido",
              ownerColor: doc.owner?.color ?? "#64748b",
            },
          ]
        : [],
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <RealtimeRefresh userId={user.id} />
      <DocumentGrid documents={documents} />
    </>
  );
}

function DocumentGridSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-72 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
