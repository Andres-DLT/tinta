/**
 * Constantes compartidas entre el cliente (navegador) y el servidor WebSocket.
 * Este archivo no debe importar nada específico de Node ni del navegador.
 */

/** Tipos de mensaje del protocolo y-websocket (primer varUint de cada mensaje). */
export const MessageType = {
  Sync: 0,
  Awareness: 1,
  Auth: 2,
  QueryAwareness: 3,
} as const;

/**
 * Códigos de cierre propios (rango privado 4000-4999 de RFC 6455).
 * El cliente y-websocket considera permanentes los 4400-4499 y deja de
 * reconectar, emitiendo el evento `closed`.
 */
export const CloseCode = {
  BadRequest: 4400,
  Unauthorized: 4401,
  Forbidden: 4403,
  NotFound: 4404,
  /** El rol del usuario cambió mientras estaba conectado: hay que recargar. */
  PermissionsChanged: 4409,
  /** El servidor se está reiniciando: reintentar (no está en el rango 44xx). */
  ServerRestart: 4500,
} as const;

export type CloseCodeValue = (typeof CloseCode)[keyof typeof CloseCode];

/** Nombre del Y.XmlFragment con el contenido rico (TipTap/ProseMirror). */
export const CONTENT_FIELD = "default";
/** Nombre del Y.Text con el título del documento. */
export const TITLE_FIELD = "title";

export const MAX_TITLE_LENGTH = 200;
export const MAX_PREVIEW_LENGTH = 280;

export type DocumentRole = "owner" | "editor" | "viewer";
export type LinkAccess = "none" | "view" | "edit";

export const canEdit = (role: DocumentRole) => role !== "viewer";

/** Datos de usuario que viajan en el estado de awareness (presencia). */
export interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_RE.test(value);
