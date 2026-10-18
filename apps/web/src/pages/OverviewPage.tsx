import { Link } from "react-router-dom";
import { useOrganizations } from "../organizations";
import { useProjects } from "../projects";

/**
 * Painel. Mostra APENAS indicadores calculáveis com dados reais existentes hoje
 * (projetos). Indicadores de documentos/BOM entram quando essas funções existirem.
 */
export function OverviewPage() {
  const { current } = useOrganizations();
  const { projects, loading, error } = useProjects(current?.organizationId ?? null);
  const active = projects.filter((p) => p.status === "active");

  return (
    <>
      <h1>Visão geral</h1>
      <p className="muted">Acompanhe o andamento dos seus projetos.</p>

      <div className="stats">
        <div className="card stat">
          <span className="muted">Projetos ativos</span>
          <strong>{loading ? "…" : error ? "—" : active.length}</strong>
        </div>
      </div>

      <section className="card">
        <div className="row">
          <h2>Projetos recentes</h2>
          <span className="spacer" />
          <Link to="/projects">Ver todos</Link>
        </div>
        {error ? (
          <p className="error">Não foi possível carregar os projetos.</p>
        ) : loading ? (
          <p className="muted">Carregando…</p>
        ) : active.length === 0 ? (
          <p className="muted">Nenhum projeto ainda. Crie o primeiro em Projetos.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Código</th><th>Nome</th><th>Atualizado</th></tr>
            </thead>
            <tbody>
              {active.slice(0, 5).map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/projects/${p.id}`}>{p.code}</Link></td>
                  <td>{p.name}</td>
                  <td>{p.updatedAt ? p.updatedAt.toLocaleString("pt-BR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
