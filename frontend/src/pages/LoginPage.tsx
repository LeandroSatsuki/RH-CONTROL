import { FormEvent, useEffect, useState } from "react";
import { IS_DEMO_MODE, api } from "../api";
import { ErrorMessage } from "../components/Feedback";
import { User } from "../types";

const SAVED_LOGIN_KEY = "nexo-saved-login";

interface Props {
  onLogin: (token: string, user: User) => void;
  initialError?: string;
  localMode?: boolean;
}

function readSavedLogin() {
  try {
    const raw = localStorage.getItem(SAVED_LOGIN_KEY);
    if (!raw) return { username: "", password: "", savePassword: false };
    const parsed = JSON.parse(raw) as { username?: string };
    return {
      username: parsed.username ?? "",
      password: "",
      savePassword: true
    };
  } catch {
    localStorage.removeItem(SAVED_LOGIN_KEY);
    return { username: "", password: "", savePassword: false };
  }
}

async function persistSavedLogin(username: string, password: string, savePassword: boolean) {
  if (!savePassword) {
    localStorage.removeItem(SAVED_LOGIN_KEY);
    await window.nexoCredentials?.clear();
    return;
  }
  localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify({ username }));
  await window.nexoCredentials?.save({ username, password });
}

export function LoginPage({ onLogin, initialError = "", localMode = IS_DEMO_MODE }: Props) {
  const [savedLogin] = useState(readSavedLogin);
  const [username, setUsername] = useState(savedLogin.username);
  const [password, setPassword] = useState(savedLogin.password);
  const [savePassword, setSavePassword] = useState(savedLogin.savePassword);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    window.nexoCredentials?.load().then(credentials => {
      if (!active || !credentials) return;
      setUsername(credentials.username);
      setPassword(credentials.password);
      setSavePassword(true);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api<{ access_token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      await persistSavedLogin(username, password, savePassword);
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
        <h1>Nexo conecta<br />pessoas e custos.</h1>
        <p>Pessoas e custos organizados em um único lugar, na sua rede local.</p>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark large">NX</div>
        <h2>Bem-vindo</h2>
        <p>{localMode ? "Modo local ativo para uso sem servidor." : "Entre para acessar o painel."}</p>
        {localMode && <div className="demo-credentials">Usuários iniciais locais:<br />admin/admin<br />consultor/consultor</div>}
        <label>Usuário<input autoFocus value={username} onChange={e => setUsername(e.target.value)} required /></label>
        <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        <label className="check save-password">
          <input
            type="checkbox"
            checked={savePassword}
            onChange={event => {
              setSavePassword(event.target.checked);
              if (!event.target.checked) {
                localStorage.removeItem(SAVED_LOGIN_KEY);
                void window.nexoCredentials?.clear();
              }
            }}
          />
          Salvar usuário e senha neste computador
        </label>
        <ErrorMessage message={error} />
        <button className="primary" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
      </form>
    </div>
  );
}
