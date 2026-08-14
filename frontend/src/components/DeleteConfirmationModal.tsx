import { FormEvent, useState } from "react";

interface DeleteConfirmationModalProps {
  title: string;
  itemName: string;
  description: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (password: string) => void | Promise<void>;
}

export function DeleteConfirmationModal({
  title,
  itemName,
  description,
  busy = false,
  error = "",
  onCancel,
  onConfirm
}: DeleteConfirmationModalProps) {
  const [password, setPassword] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    void onConfirm(password);
  }

  return <div className="presentation-modal movement-modal-backdrop" onClick={() => !busy && onCancel()}>
    <section className="presentation-modal-panel movement-modal quick-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirmation-title" onClick={event => event.stopPropagation()}>
      <div className="presentation-modal-header movement-modal-header">
        <div>
          <span className="eyebrow">Confirmação de segurança</span>
          <h2 id="delete-confirmation-title">{title}</h2>
          <p><strong>{itemName}</strong></p>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} disabled={busy} aria-label="Fechar">×</button>
      </div>
      <form className="presentation-modal-body movement-modal-body" onSubmit={submit}>
        <p className="note">{description}</p>
        <label>Senha do Administrador
          <input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="field-feedback error">{error}</p>}
        <div className="actions movement-modal-actions">
          <button className="secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="danger" type="submit" disabled={busy || !password}>{busy ? "Excluindo..." : "Excluir definitivamente"}</button>
        </div>
      </form>
    </section>
  </div>;
}
