import { Link, useParams } from "react-router-dom";
import { useOrganizations } from "../organizations";
import { useProject } from "../projects";
import { DocumentsSection } from "./DocumentsSection";

/**
 * Página do projeto: visão geral e documentos (Fase 2). Dados sempre reais.
 * Desenhos, BOM, pendências e histórico entram nas fases seguintes.
 */
export function ProjectPage() {
  const { projectId } = useParams();
  const { current } = useOrganizations();
  const { project, loading } = useProject(current?.organizationId ?? null, projectId);

  if (loading) return <p className="muted">Carregando…</p>;
  if (!project) {
    return (
      <>
        <h1>Projeto não encontrado</h1>
        <p><Link to="/projects">Voltar para Projetos</Link></p>
      </>
    );
  }

  return (
    <>
      <p className="muted"><Link to="/projects">Projetos</Link> / {project.code}</p>
      <h1>{project.name}</h1>
      <section className="card">
        <h2>Visão geral</h2>
        <dl className="kv">
          <dt>Código</dt><dd>{project.code}</dd>
          <dt>Status</dt><dd>{project.status === "active" ? "Ativo" : "Arquivado"}</dd>
          <dt>Descrição</dt><dd>{project.description || "—"}</dd>
          <dt>Atualizado</dt><dd>{project.updatedAt ? project.updatedAt.toLocaleString("pt-BR") : "—"}</dd>
        </dl>
        <p className="muted">A geração de BOM será adicionada nas próximas fases.</p>
      </section>
      <DocumentsSection projectId={project.id} />
    </>
  );
}
