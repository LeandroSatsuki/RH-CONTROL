import { FormEvent, useState } from "react";
import { api } from "../api";
import { ErrorMessage } from "../components/Feedback";

export function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      await api("/setup", {
        method: "POST",
        body: JSON.stringify({
          company_name: form.get("company_name"),
          backup_directory: form.get("backup_directory"),
          auto_backup_on_start: form.get("auto_backup_on_start") === "on",
          include_saturdays: form.get("include_saturdays") === "on",
          include_sundays: form.get("include_sundays") === "on",
          default_daily_hours: Number(form.get("default_daily_hours")),
          admin_username: form.get("admin_username"),
          admin_full_name: form.get("admin_full_name"),
          admin_password: form.get("admin_password")
        })
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na configuração");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="setup-page">
      <form className="setup-card" onSubmit={submit}>
        <span className="eyebrow">Primeira execução</span>
        <h1>Vamos configurar o sistema</h1>
        <p>Estas opções poderão ser ajustadas por um administrador.</p>
        <div className="form-grid">
          <label className="span-2">Nome da empresa<input name="company_name" required /></label>
          <label className="span-2">Pasta de backup<input name="backup_directory" defaultValue="C:\\SistemaIndicadoresFolha\\backups" /></label>
          <label>Jornada padrão diária<input name="default_daily_hours" type="number" step="0.1" defaultValue="8.8" required /></label>
          <label className="check"><input name="auto_backup_on_start" type="checkbox" defaultChecked /> Backup automático ao abrir</label>
          <label className="check"><input name="include_saturdays" type="checkbox" /> Incluir sábados no cálculo</label>
          <label className="check"><input name="include_sundays" type="checkbox" /> Incluir domingos no cálculo</label>
          <label>Usuário administrador<input name="admin_username" defaultValue="admin" required /></label>
          <label>Nome do administrador<input name="admin_full_name" required /></label>
          <label className="span-2">Senha inicial<input name="admin_password" type="password" minLength={8} required /></label>
        </div>
        <ErrorMessage message={error} />
        <button className="primary" disabled={loading}>{loading ? "Configurando..." : "Concluir configuração"}</button>
      </form>
    </div>
  );
}
