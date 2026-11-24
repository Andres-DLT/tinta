import type { SupabaseClient } from "@supabase/supabase-js";
import { CloseCode } from "../src/lib/collab/protocol";
import type { Database } from "../src/lib/supabase/database.types";
import { CollabError, type Authorize, type GetRoles, type Persistence } from "./types";

type AdminClient = SupabaseClient<Database>;

/** bytea ⇄ texto hexadecimal `\x…`, que es como PostgREST lo serializa. */
export const byteaToBytes = (value: string): Uint8Array =>
  value.startsWith("\\x") ? new Uint8Array(Buffer.from(value.slice(2), "hex")) : new Uint8Array();
export const bytesToBytea = (bytes: Uint8Array): string =>
  `\\x${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex")}`;

/**
 * Autorización y persistencia respaldadas por Supabase.
 * `supabase` debe crearse con la clave secreta (service role): ignora RLS,
 * así que aquí comprobamos explícitamente la pertenencia al documento.
 */
export function createSupabaseBackend(supabase: AdminClient) {
  const authorize: Authorize = async (token, documentId) => {
    if (!token) throw new CollabError(CloseCode.Unauthorized, "Falta el token");

    // Verifica firma y caducidad del JWT (localmente vía JWKS si el proyecto
    // usa claves asimétricas; si no, consultando a Supabase Auth).
    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) throw new CollabError(CloseCode.Unauthorized, "Token inválido o caducado");

    const { data: member, error: memberError } = await supabase
      .from("document_members")
      .select("role, profiles(display_name, color)")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberError) throw memberError;

    if (!member || !member.profiles) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .maybeSingle();
      if (docError) throw docError;
      throw doc
        ? new CollabError(CloseCode.Forbidden, "Sin acceso a este documento")
        : new CollabError(CloseCode.NotFound, "Documento no encontrado");
    }

    return {
      role: member.role,
      user: { id: userId, name: member.profiles.display_name, color: member.profiles.color },
    };
  };

  const persistence: Persistence = {
    async load(documentId) {
      const { data: doc, error } = await supabase
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      if (!doc) return null;

      const { data: stored, error: stateError } = await supabase
        .from("document_states")
        .select("state")
        .eq("document_id", documentId)
        .maybeSingle();
      if (stateError) throw stateError;

      return { state: stored ? byteaToBytes(stored.state) : null };
    },

    async save(documentId, snapshot) {
      const { data, error } = await supabase.rpc("save_document_snapshot", {
        p_document_id: documentId,
        p_state: bytesToBytea(snapshot.state),
        p_title: snapshot.title,
        p_preview: snapshot.preview,
      });
      if (error) throw error;
      return data === true;
    },
  };

  const getRoles: GetRoles = async (documentId) => {
    const { data: doc, error } = await supabase
      .from("documents")
      .select("id, document_members(user_id, role)")
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return null;
    return new Map(doc.document_members.map((m) => [m.user_id, m.role]));
  };

  return { authorize, persistence, getRoles };
}
