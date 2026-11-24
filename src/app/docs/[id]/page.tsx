import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonStyles, cn } from "@/components/ui";
import { CenteredMessage, DocumentEditor, EditorSkeleton } from "@/components/editor/document-editor";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/collab/protocol";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documento" };

export default function DocumentPage({ params }: PageProps<"/docs/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <DocumentLoader params={params} />
    </Suspense>
  );
}

async function DocumentLoader({ params }: { params: PageProps<"/docs/[id]">["params"] }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const user = await getCurrentUser();
  const supabase = await createClient();

  // Comprueba el acceso (y se une si el documento se comparte por enlace).
  const { data, error } = await supabase.rpc("open_document", { p_document_id: id });
  const doc = data?.[0];

  if (error || !doc) {
    return (
      <CenteredMessage
        title="No tienes acceso a este documento"
        text="Pide a su propietario que te invite o que active el acceso mediante enlace."
      >
        <Link href="/docs" className={cn(buttonStyles.base, buttonStyles.primary)}>
          Ir a mis documentos
        </Link>
      </CenteredMessage>
    );
  }

  return (
    <DocumentEditor
      key={id}
      documentId={id}
      role={doc.role}
      linkAccess={doc.link_access}
      user={{ id: user.id, name: user.name, color: user.color }}
    />
  );
}
