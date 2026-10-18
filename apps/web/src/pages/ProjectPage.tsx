import { Link, useParams } from "react-router-dom";
import { useDocuments } from "../documents";
import { useBom, useExtractions } from "../extractions";
import { useOrganizations } from "../organizations";
import { useProject } from "../projects";
import { BomSection } from "./BomSection";
import { DocumentsSection } from "./DocumentsSection";

/**
 * Página do projeto (um lote de desenhos): 1) enviar os desenhos; 2) conferir a BOM montada
 * a partir da leitura por IA e baixar a planilha "Controle de Avanço" com o relatório.
 */
export function ProjectPage() {
  const { projectId } = useParams();
  const { current } = useOrganizations();
  const organizationId = current?.organizationId ?? null;
  const { project, loading } = useProject(organizationId, projectId);
  const docs = useDocuments(organizationId, projectId);
  const extractions = useExtractions(organizationId, projectId);
  const bom = useBom(extractions.byId);

  if (loading) return <p className="muted">Carregando…</p>;
  if (!project) {
    return (
      <>
        <h1>Projeto não encontrado</h1>
        <p><Link to="/projects">Voltar para Projetos</Link></p>
      </>
    );
  }

  const pendingReadings = docs.rows.filter((r) => r.job?.status === "queued" || r.job?.status === "running").length;

  return (
    <>
      <p className="muted"><Link to="/projects">Projetos</Link> / {project.code}</p>
      <h1>{project.name}</h1>
      {project.description && <p className="muted" style={{ margin: 0 }}>{project.description}</p>}
      <DocumentsSection projectId={project.id} rows={docs.rows} loading={docs.loading} error={docs.error} />
      <BomSection
        projectId={project.id}
        projectName={project.name}
        projectCode={project.code}
        bom={bom}
        extractions={extractions.byId}
        pendingReadings={pendingReadings}
      />
      {extractions.error && <p className="error">Não foi possível carregar as leituras.</p>}
    </>
  );
}
