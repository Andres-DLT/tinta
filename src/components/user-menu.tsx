import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "./ui";

/** Lee la sesión: debe renderizarse dentro de un <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm leading-tight font-medium">{user.name}</p>
        <p className="text-xs leading-tight text-muted">{user.email}</p>
      </div>
      <Avatar name={user.name} color={user.color} />
      <form action={signOut}>
        <button
          type="submit"
          title="Cerrar sesión"
          className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="size-4" aria-hidden />
          <span className="sr-only">Cerrar sesión</span>
        </button>
      </form>
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden h-8 w-32 animate-pulse rounded bg-surface-2 sm:block" />
      <div className="size-9 animate-pulse rounded-full bg-surface-2" />
    </div>
  );
}
