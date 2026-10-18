import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { hasAtLeastRole, PROJECT_CODE_REGEX } from "@mecabom/shared";
import { friendlyError } from "../errors";
import { useOrganizations } from "../organizations";
import { createProject, useProjects } from "../projects";

export function ProjectsPage() {
  const { current } = useOrganizations();
  const { projects, loading, error } = useProjects(current?.organizationId ?? null);
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!current) return null;
  // A interface apenas esconde o formulário; a autorização real é feita no servidor.
  const canCreate = hasAtLeastRole(current.role, "reviewer");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setBusy(true);
    setFormError(null);
    try {
      const id = await createProject({
        organizationId: current.organizationId,
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
      });
      navigate(`/projects/${id}`);
    } catch (err) {
      setFormError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Projetos</h1>

      {canCreate && (
        <form className="card form-grid" onSubmit={onSubmit}>
          <h2>Novo projeto</h2>
          <label>
            Código
            <input
              required
              pattern={PROJECT_CODE_REGEX.source}
              title="Letras, números, ponto, hífen ou sublinhado (2 a 40 caracteres)"
              placeholder="PR-2026-018"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label>
            Nome
            <input required minLength={2} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="wide">
            Descrição (opcional)
            <textarea maxLength={2000} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          {formError && <p role="alert" className="error wide">{formError}</p>}
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "Criando…" : "Criar projeto"}
          </button>
        </form>
      )}

      <section className="card">
        {error ? (
          <p className="error">Não foi possível carregar os projetos.</p>
        ) : loading ? (
          <p className="muted">Carregando…</p>
        ) : projects.length === 0 ? (
          <p className="muted">Nenhum projeto ainda.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Código</th><th>Nome</th><th>Status</th><th>Atualizado</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/projects/${p.id}`}>{p.code}</Link></td>
                  <td>{p.name}</td>
                  <td>{p.status === "active" ? "Ativo" : "Arquivado"}</td>
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
