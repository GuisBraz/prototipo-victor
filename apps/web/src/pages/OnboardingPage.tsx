import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { friendlyError } from "../errors";
import { useOrganizations } from "../organizations";
import { createOrganization } from "../projects";

/** Exibida quando o usuário ainda não pertence a nenhuma organização. */
export function OnboardingPage() {
  const { signOut } = useAuth();
  const { select } = useOrganizations();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      select(await createOrganization(name));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1 className="brand">MECABOM</h1>
        <p className="muted">
          Crie a organização (empresa) que vai reunir seus projetos. Você será o administrador.
        </p>
        <label>
          Nome da organização
          <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="btn primary" disabled={busy} type="submit">
          {busy ? "Criando…" : "Criar organização"}
        </button>
        <button type="button" className="btn link" onClick={() => void signOut()}>
          Sair
        </button>
      </form>
    </main>
  );
}
