import { WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { CloseCode, MessageType, canEdit } from "../src/lib/collab/protocol";
import { getPreview, getTitle } from "./doc-text";
import type { AuthContext, LoadedDocument, Logger, Persistence } from "./types";

/** Tamaño máximo del estado de awareness (cursor, nombre…) por cliente. */
const MAX_AWARENESS_STATE_BYTES = 8 * 1024;

/** Origen de la transacción con la que cargamos el estado persistido. */
const LOAD_ORIGIN = Symbol("load");

export interface RoomOptions {
  /** Espera tras el último cambio antes de guardar. */
  saveDebounceMs: number;
  /** Tiempo máximo que un cambio puede quedar sin guardar con edición continua. */
  saveMaxWaitMs: number;
}

interface Connection {
  ws: WebSocket;
  auth: AuthContext;
  /** clientIDs de awareness que pertenecen a esta conexión. */
  clientIds: Set<number>;
}

type AwarenessChange = { added: number[]; updated: number[]; removed: number[] };

function encodeMessage(type: number, write: (encoder: encoding.Encoder) => void) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, type);
  write(encoder);
  return encoding.toUint8Array(encoder);
}

/**
 * Un documento abierto en memoria: el Y.Doc autoritativo, la presencia
 * (awareness) y las conexiones WebSocket de quienes lo están editando.
 */
export class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  private readonly conns = new Map<WebSocket, Connection>();

  /** Referencias activas (conexiones + conexiones a punto de entrar). */
  refs = 0;
  destroyed = false;

  private dirty = false;
  private firstDirtyAt = 0;
  private saveTimer: NodeJS.Timeout | null = null;
  private saving: Promise<void> | null = null;

  constructor(
    readonly id: string,
    initial: LoadedDocument,
    private readonly persistence: Persistence,
    private readonly logger: Logger,
    private readonly options: RoomOptions,
  ) {
    if (initial.state && initial.state.length > 0) {
      Y.applyUpdate(this.doc, initial.state, LOAD_ORIGIN);
    }
    // El servidor no tiene estado de presencia propio.
    this.awareness.setLocalState(null);
    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
  }

  get connectionCount() {
    return this.conns.size;
  }

  /** Usuarios conectados (para métricas/depuración). */
  get users() {
    return [...this.conns.values()].map((c) => ({ ...c.auth.user, role: c.auth.role }));
  }

  addConnection(ws: WebSocket, auth: AuthContext, onClose: () => void) {
    const conn: Connection = { ws, auth, clientIds: new Set() };
    this.conns.set(ws, conn);

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        ws.close(CloseCode.BadRequest, "Se esperan mensajes binarios");
        return;
      }
      this.handleMessage(conn, toUint8Array(data));
    });
    ws.on("close", () => {
      this.removeConnection(conn);
      onClose();
    });
    ws.on("error", (err) => {
      this.logger.warn("Error en WebSocket", { room: this.id, error: err.message });
    });

    // Paso 1 de la sincronización: pedimos al cliente lo que nos falte...
    this.send(ws, encodeMessage(MessageType.Sync, (e) => syncProtocol.writeSyncStep1(e, this.doc)));
    // ...y le enviamos quién está conectado ahora mismo.
    const states = this.awareness.getStates();
    if (states.size > 0) {
      this.send(
        ws,
        encodeMessage(MessageType.Awareness, (e) =>
          encoding.writeVarUint8Array(
            e,
            awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...states.keys()]),
          ),
        ),
      );
    }
  }

  private removeConnection(conn: Connection) {
    if (!this.conns.delete(conn.ws)) return;
    if (conn.clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, [...conn.clientIds], null);
    }
  }

  private handleMessage(conn: Connection, data: Uint8Array) {
    try {
      const decoder = decoding.createDecoder(data);
      const type = decoding.readVarUint(decoder);

      switch (type) {
        case MessageType.Sync: {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MessageType.Sync);
          const syncType = decoding.readVarUint(decoder);

          if (syncType === syncProtocol.messageYjsSyncStep1) {
            // El cliente nos dice qué tiene; respondemos con lo que le falta.
            syncProtocol.readSyncStep1(decoder, encoder, this.doc);
          } else if (
            syncType === syncProtocol.messageYjsSyncStep2 ||
            syncType === syncProtocol.messageYjsUpdate
          ) {
            // Los lectores (viewer) no pueden modificar el documento:
            // ignoramos sus actualizaciones en el servidor.
            if (canEdit(conn.auth.role)) {
              syncProtocol.readSyncStep2(decoder, this.doc, conn.ws, (err) => {
                throw err;
              });
            }
          } else {
            throw new Error(`Tipo de mensaje sync desconocido: ${syncType}`);
          }

          if (encoding.length(encoder) > 1) {
            this.send(conn.ws, encoding.toUint8Array(encoder));
          }
          break;
        }

        case MessageType.Awareness: {
          const update = decoding.readVarUint8Array(decoder);
          const sanitized = this.sanitizeAwarenessUpdate(conn, update);
          if (sanitized) {
            awarenessProtocol.applyAwarenessUpdate(this.awareness, sanitized, conn.ws);
          }
          break;
        }

        case MessageType.QueryAwareness: {
          const clients = [...this.awareness.getStates().keys()];
          this.send(
            conn.ws,
            encodeMessage(MessageType.Awareness, (e) =>
              encoding.writeVarUint8Array(
                e,
                awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients),
              ),
            ),
          );
          break;
        }

        default:
          throw new Error(`Tipo de mensaje desconocido: ${type}`);
      }
    } catch (err) {
      this.logger.warn("Mensaje inválido; se cierra la conexión", {
        room: this.id,
        user: conn.auth.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      conn.ws.close(CloseCode.BadRequest, "Mensaje inválido");
    }
  }

  /**
   * Reescribe una actualización de awareness para que:
   *  - el campo `user` (nombre, color, id) sea siempre el del usuario autenticado
   *    (nadie puede suplantar a otra persona en los cursores), y
   *  - una conexión no pueda modificar la presencia de clientes ajenos.
   */
  private sanitizeAwarenessUpdate(conn: Connection, update: Uint8Array): Uint8Array | null {
    const decoder = decoding.createDecoder(update);
    const entries: Array<{ clientId: number; clock: number; state: string }> = [];
    const len = decoding.readVarUint(decoder);

    for (let i = 0; i < len; i++) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const rawState = decoding.readVarString(decoder);

      const owner = this.findClientOwner(clientId);
      if (owner && owner !== conn) {
        // Mismo usuario reconectando (p. ej. tras un corte de red): traspasamos.
        if (owner.auth.user.id !== conn.auth.user.id) continue;
        owner.clientIds.delete(clientId);
      }

      if (rawState.length > MAX_AWARENESS_STATE_BYTES) continue;
      const parsed: unknown = JSON.parse(rawState);
      const state =
        parsed !== null && typeof parsed === "object"
          ? { ...(parsed as Record<string, unknown>), user: { ...conn.auth.user, role: conn.auth.role } }
          : null;

      entries.push({ clientId, clock, state: JSON.stringify(state) });
    }

    if (entries.length === 0) return null;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, entries.length);
    for (const entry of entries) {
      encoding.writeVarUint(encoder, entry.clientId);
      encoding.writeVarUint(encoder, entry.clock);
      encoding.writeVarString(encoder, entry.state);
    }
    return encoding.toUint8Array(encoder);
  }

  private findClientOwner(clientId: number) {
    for (const conn of this.conns.values()) {
      if (conn.clientIds.has(clientId)) return conn;
    }
    return undefined;
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === LOAD_ORIGIN) return;
    const message = encodeMessage(MessageType.Sync, (e) => syncProtocol.writeUpdate(e, update));
    for (const conn of this.conns.values()) {
      if (conn.ws !== origin) this.send(conn.ws, message);
    }
    this.scheduleSave();
  };

  private handleAwarenessUpdate = ({ added, updated, removed }: AwarenessChange, origin: unknown) => {
    const source = origin instanceof WebSocket ? this.conns.get(origin) : undefined;
    if (source) {
      for (const id of added) source.clientIds.add(id);
      for (const id of updated) source.clientIds.add(id);
      for (const id of removed) source.clientIds.delete(id);
    }
    const changed = [...added, ...updated, ...removed];
    const message = encodeMessage(MessageType.Awareness, (e) =>
      encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed)),
    );
    for (const conn of this.conns.values()) {
      if (conn.ws !== origin) this.send(conn.ws, message);
    }
  };

  private send(ws: WebSocket, message: Uint8Array) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(message, (err) => {
      if (err) ws.terminate();
    });
  }

  // ---------------------------------------------------------------------------
  // Persistencia
  // ---------------------------------------------------------------------------

  private scheduleSave() {
    const now = Date.now();
    if (!this.dirty) {
      this.dirty = true;
      this.firstDirtyAt = now;
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const waited = now - this.firstDirtyAt;
    const delay = Math.max(0, Math.min(this.options.saveDebounceMs, this.options.saveMaxWaitMs - waited));
    this.saveTimer = setTimeout(() => void this.flush(), delay);
  }

  /** Guarda el estado actual si hay cambios pendientes. */
  async flush(): Promise<void> {
    while (this.saving) await this.saving;
    if (!this.dirty || this.destroyed) return;

    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.dirty = false;

    const snapshot = {
      state: Y.encodeStateAsUpdate(this.doc),
      title: getTitle(this.doc),
      preview: getPreview(this.doc),
    };

    this.saving = this.persistence
      .save(this.id, snapshot)
      .then((exists) => {
        if (!exists) {
          this.logger.info("El documento ya no existe; cerrando conexiones", { room: this.id });
          this.closeAll(CloseCode.NotFound, "Documento eliminado");
        }
      })
      .catch((err: unknown) => {
        this.logger.error("Error guardando el documento; se reintentará", {
          room: this.id,
          error: err instanceof Error ? err.message : String(err),
        });
        if (!this.destroyed) this.scheduleSave();
      })
      .finally(() => {
        this.saving = null;
      });

    await this.saving;
  }

  /** Cierra las conexiones cuyo acceso fue revocado o cuyo rol cambió. */
  applyRoles(roles: Map<string, AuthContext["role"]> | null) {
    for (const conn of this.conns.values()) {
      const current = roles?.get(conn.auth.user.id);
      if (!roles) conn.ws.close(CloseCode.NotFound, "Documento eliminado");
      else if (!current) conn.ws.close(CloseCode.Forbidden, "Acceso revocado");
      else if (current !== conn.auth.role) conn.ws.close(CloseCode.PermissionsChanged, "Permisos cambiados");
    }
  }

  closeAll(code: number, reason: string) {
    for (const conn of this.conns.values()) conn.ws.close(code, reason);
  }

  destroy() {
    this.destroyed = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.awareness.destroy();
    this.doc.destroy();
  }
}

function toUint8Array(data: WebSocket.RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
