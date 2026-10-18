import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { useOrganizations } from "../organizations";

export function Layout() {
  const { user, signOut } = useAuth();
  const { memberships, current, select } = useOrganizations();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">MECABOM</div>
        <nav aria-label="Principal">
          <NavLink to="/" end>Visão geral</NavLink>
          <NavLink to="/projects">Projetos</NavLink>
        </nav>
        <div className="sidebar-foot">v0.1.0 · Fase 1</div>
      </aside>

      <div className="main">
        <header className="topbar">
          {memberships.length > 1 ? (
            <select
              aria-label="Organização"
              value={current?.organizationId}
              onChange={(e) => select(e.target.value)}
            >
              {memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </select>
          ) : (
            <strong>{current?.organizationName}</strong>
          )}
          <span className="spacer" />
          <span className="muted">{user?.email}</span>
          <button className="btn" onClick={() => void signOut()}>Sair</button>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
