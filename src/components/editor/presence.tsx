"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Awareness } from "y-protocols/awareness";
import { Avatar } from "@/components/ui";
import type { DocumentRole, PresenceUser } from "@/lib/collab/protocol";

type RemoteUser = PresenceUser & { role?: DocumentRole };

/** Usuarios remotos conectados (sin duplicados si alguien abre varias pestañas). */
function createPresenceStore(awareness: Awareness, selfUserId: string) {
  const compute = () => {
    const users = new Map<string, RemoteUser>();
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return;
      const user = (state as { user?: RemoteUser }).user;
      if (!user?.id || user.id === selfUserId) return;
      users.set(user.id, user);
    });
    return [...users.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  let snapshot = compute();
  const empty: RemoteUser[] = [];
  return {
    subscribe(onStoreChange: () => void) {
      const handler = () => {
        snapshot = compute();
        onStoreChange();
      };
      awareness.on("change", handler);
      return () => awareness.off("change", handler);
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
  };
}

const ROLE_LABEL: Record<DocumentRole, string> = {
  owner: "propietario",
  editor: "editando",
  viewer: "leyendo",
};

const MAX_VISIBLE = 4;

export function Presence({
  awareness,
  self,
}: {
  awareness: Awareness;
  self: PresenceUser;
}) {
  const store = useMemo(() => createPresenceStore(awareness, self.id), [awareness, self.id]);
  const others = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const visible = others.slice(0, MAX_VISIBLE);
  const hidden = others.length - visible.length;

  return (
    <div className="flex items-center" aria-label={`${others.length + 1} personas en el documento`}>
      <div className="flex -space-x-1">
        {visible.map((user) => (
          <Avatar
            key={user.id}
            name={user.name}
            color={user.color}
            size="sm"
            title={`${user.name}${user.role ? ` · ${ROLE_LABEL[user.role]}` : ""}`}
          />
        ))}
        {hidden > 0 && (
          <span className="inline-grid size-7 place-items-center rounded-full bg-surface-2 text-[0.65rem] font-semibold text-muted ring-2 ring-surface">
            +{hidden}
          </span>
        )}
        <Avatar name={self.name} color={self.color} size="sm" title={`${self.name} (tú)`} />
      </div>
    </div>
  );
}
