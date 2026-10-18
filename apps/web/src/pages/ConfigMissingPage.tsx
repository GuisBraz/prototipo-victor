/** Mostrada quando as variáveis do Firebase ainda não foram configuradas. */
export function ConfigMissingPage() {
  return (
    <main className="auth-page">
      <section className="card auth-card">
        <h1 className="brand">MECABOM</h1>
        <p>
          O Firebase ainda não está configurado. Copie <code>apps/web/.env.example</code> para{" "}
          <code>apps/web/.env.local</code> e preencha os valores do seu projeto (ou use{" "}
          <code>VITE_USE_EMULATORS=true</code> com o projeto <code>demo-mecabom</code>).
        </p>
        <p className="muted">Passo a passo em docs/SETUP.md.</p>
      </section>
    </main>
  );
}
