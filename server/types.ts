import type { CloseCodeValue, DocumentRole, PresenceUser } from "../src/lib/collab/protocol";

/** Resultado de autenticar + autorizar una conexión a un documento. */
export interface AuthContext {
  user: PresenceUser;
  role: DocumentRole;
}

/**
 * Valida el token del usuario y su acceso al documento.
 * Debe lanzar `CollabError` con el código de cierre adecuado si no hay acceso.
 */
export type Authorize = (token: string | null, documentId: string) => Promise<AuthContext>;

/**
 * Roles actuales de un documento (userId → rol), o null si ya no existe.
 * Se usa para revalidar periódicamente las conexiones abiertas.
 */
export type GetRoles = (documentId: string) => Promise<Map<string, DocumentRole> | null>;

export interface LoadedDocument {
  /** Estado Yjs completo (update codificado) o null si nunca se guardó. */
  state: Uint8Array | null;
}

export interface DocumentSnapshot {
  state: Uint8Array;
  title: string;
  preview: string;
}

export interface Persistence {
  /** Devuelve null si el documento no existe. */
  load(documentId: string): Promise<LoadedDocument | null>;
  /** Devuelve false si el documento ya no existe (p. ej. fue borrado). */
  save(documentId: string, snapshot: DocumentSnapshot): Promise<boolean>;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export class CollabError extends Error {
  constructor(
    readonly code: CloseCodeValue,
    message: string,
  ) {
    super(message);
    this.name = "CollabError";
  }
}
