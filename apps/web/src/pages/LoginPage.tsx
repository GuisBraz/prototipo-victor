import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { friendlyError } from "../errors";

export function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") await signIn(email.trim(), password);
      else await signUp(email.trim(), password);
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
          {mode === "signin" ? "Entre para acessar seus projetos." : "Crie sua conta."}
        </p>

        <label>
          E-mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Senha
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p role="alert" className="error">{error}</p>}

        <button className="btn primary" disabled={busy} type="submit">
          {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
        </button>
        <button
          type="button"
          className="btn link"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
        >
          {mode === "signin" ? "Não tenho conta" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}
