import type { ReactNode } from "react";
import { requireSession, signOut } from "@/auth";
import { NavLink } from "@/components/nav-link";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mark">▲</span>
          <span className="name">tent</span>
        </div>
        <nav className="nav">
          <NavLink href="/dashboard">dashboard</NavLink>
          <NavLink href="/servers">servers</NavLink>
          <NavLink href="/sites">sites</NavLink>
          <NavLink href="/jobs">jobs</NavLink>
          <NavLink href="/templates">templates</NavLink>
          <NavLink href="/secrets">secrets</NavLink>
          <NavLink href="/settings">settings</NavLink>
        </nav>
        <div className="sidebar-footer">
          <div>{session.user.name ?? session.user.email ?? "operator"}</div>
          <div className="role mt-1">{session.user.role}</div>
          <form action={doSignOut} className="mt-2">
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                color: "var(--ink-soft)",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
