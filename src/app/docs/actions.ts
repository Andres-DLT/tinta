"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/collab/protocol";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string } | undefined;

export async function createDocument() {
  await getCurrentUser();
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_document", {});
  if (error || !id) throw new Error("No se pudo crear el documento.");
  redirect(`/docs/${id}`);
}

/** Elimina un documento. RLS garantiza que solo el propietario pueda hacerlo. */
export async function deleteDocument(documentId: string): Promise<ActionResult> {
  if (!isUuid(documentId)) return { error: "Documento no válido." };
  await getCurrentUser();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("documents")
    .delete({ count: "exact" })
    .eq("id", documentId);
  if (error) return { error: "No se pudo eliminar el documento." };
  if (count === 0) return { error: "Solo el propietario puede eliminar el documento." };
  refresh();
}

/** Deja de tener acceso a un documento compartido contigo. */
export async function leaveDocument(documentId: string): Promise<ActionResult> {
  if (!isUuid(documentId)) return { error: "Documento no válido." };
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("document_members")
    .delete({ count: "exact" })
    .eq("document_id", documentId)
    .eq("user_id", user.id);
  if (error || count === 0) return { error: "No se pudo salir del documento." };
  refresh();
}
