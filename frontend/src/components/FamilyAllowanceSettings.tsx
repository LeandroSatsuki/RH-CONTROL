import { useEffect, useState } from "react";
import { api } from "../api";
import { User } from "../types";
import { ErrorMessage, SuccessMessage } from "./Feedback";
type Rate = { effective_date: string; amount: number };

export function FamilyAllowanceSettings({ token, user }: { token: string; user: User }) {
  const [rates, setRates] = useState<Rate[]>([]);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => { let active = true; api<{ family_allowance_rates?: Rate[] }>("/demo/settings?company_id=0", {}, token).then(settings => { if (active) setRates(settings.family_allowance_rates ?? []); }).catch(err => { if (active) setError(String(err)); }); return () => { active = false; }; }, [token]);
  async function save() {
    if (!date || amount === "" || Number(amount) < 0) { setError("Informe data inicial e valor não negativo."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const updated = await api<{ family_allowance_rates: Rate[] }>("/demo/settings?company_id=0", { method: "POST", body: JSON.stringify({ family_allowance_rates: [{ effective_date: date, amount: Number(amount) }] }) }, token);
      setRates(updated.family_allowance_rates); setDate(""); setAmount(""); setSuccess("Nova vigência global salva; valores anteriores preservados.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a vigência."); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Salário-família — configuração global</h2><p className="note">Marque a elegibilidade no colaborador. O valor passa a valer na data inicial para todas as empresas; não integra o Custo/Folha. Cadastre uma nova vigência para reajustes.</p><ErrorMessage message={error} /><SuccessMessage message={success} />
    <table><thead><tr><th>Vigência inicial</th><th>Valor</th></tr></thead><tbody>{rates.map(rate => <tr key={rate.effective_date}><td>{rate.effective_date.split("-").reverse().join("/")}</td><td>{rate.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td></tr>)}</tbody></table>
    {user.role === "ADMIN" && <div className="form-grid compact"><label>Data inicial<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label><label>Valor<input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label><button type="button" className="primary" disabled={busy} onClick={() => void save()}>Adicionar vigência</button></div>}
  </section>;
}
