import { FormEvent, useState } from "react";
import { IS_DEMO_MODE, api } from "../api";
import { ErrorMessage } from "../components/Feedback";
import { User } from "../types";

interface Props {
  onLogin: (token: string, user: User) => void;
  initialError?: string;
}

export function LoginPage({ onLogin, initialError = "" }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ access_token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      onLogin(result.access_token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <span className="eyebrow">Controle de RH</span>
        <h1>Indicadores claros.<br />Decisões melhores.</h1>
        <p>Folha, pessoas e custos organizados em um único lugar, na sua rede local.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark large">IF</div>
        <h2>Bem-vindo</h2>
        <p>{IS_DEMO_MODE ? "Protótipo de apresentação com dados fictícios." : "Entre para acessar o painel."}</p>
        {IS_DEMO_MODE && <div className="demo-credentials">admin/admin<br />consultor/consultor</div>}
        <label>Usuário<input autoFocus value={username} onChange={e => setUsername(e.target.value)} required /></label>
        <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <ErrorMessage message={error} />
        <button className="primary" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
      </form>
    </div>
  );
}
