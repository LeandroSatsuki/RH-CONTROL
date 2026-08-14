import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { User } from "../types";

type ChatContact = {
  id: number;
  username: string;
  full_name: string;
  role: User["role"];
  unread_count: number;
  last_message: string;
  last_message_at: string | null;
  last_sender_id: number | null;
};

type ChatMessage = {
  id: number;
  sender_id: number;
  recipient_id: number;
  body: string;
  created_at: string;
  read_at: string | null;
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function messageTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function NetworkChat({ currentUser, token }: { currentUser: User; token: string }) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEnd = useRef<HTMLDivElement | null>(null);
  const selected = contacts.find(contact => contact.id === selectedId) ?? null;
  const unread = useMemo(() => contacts.reduce((total, contact) => total + contact.unread_count, 0), [contacts]);

  async function loadContacts(silent = false) {
    try {
      const response = await api<ChatContact[]>("/chat/contacts", {}, token);
      setContacts(response);
      if (!silent) setError("");
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Não foi possível carregar o chat.");
    }
  }

  async function loadMessages(userId: number, silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await api<ChatMessage[]>(`/chat/messages/${userId}`, {}, token);
      setMessages(response);
      setContacts(current => current.map(contact => contact.id === userId ? { ...contact, unread_count: 0 } : contact));
      if (!silent) setError("");
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Não foi possível carregar a conversa.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadContacts();
    const timer = window.setInterval(() => void loadContacts(true), 5_000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (!open || !selectedId) return;
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 3_000);
    return () => window.clearInterval(timer);
  }, [open, selectedId, token]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await api<ChatMessage>(`/chat/messages/${selectedId}`, {
        method: "POST",
        body: JSON.stringify({ body })
      }, token);
      setMessages(current => [...current, message]);
      setDraft("");
      void loadContacts(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  function selectContact(contact: ChatContact) {
    setSelectedId(contact.id);
    setMessages([]);
    setError("");
  }

  return <div className={`network-chat ${open ? "open" : ""}`}>
    {open && <section className="network-chat-panel" aria-label="Chat interno">
      <header className="network-chat-header">
        <div><strong>Chat Nexo</strong><small>Usuários conectados ao servidor</small></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar chat">×</button>
      </header>
      <div className="network-chat-body">
        <aside className="network-chat-contacts">
          {!contacts.length && <p>Nenhum outro usuário ativo.</p>}
          {contacts.map(contact => <button key={contact.id} type="button" className={selectedId === contact.id ? "active" : ""} onClick={() => selectContact(contact)} title={contact.full_name}>
            <span className="chat-avatar">{initials(contact.full_name)}</span>
            <span><strong>{contact.full_name}</strong><small>{contact.last_message || contact.username}</small></span>
            {contact.unread_count > 0 && <b>{Math.min(contact.unread_count, 99)}</b>}
          </button>)}
        </aside>
        <main className="network-chat-conversation">
          {!selected && <div className="network-chat-empty"><span>💬</span><strong>Selecione uma pessoa</strong><small>As mensagens ficam disponíveis nos computadores ligados a este servidor.</small></div>}
          {selected && <>
            <div className="network-chat-person"><span className="chat-avatar">{initials(selected.full_name)}</span><div><strong>{selected.full_name}</strong><small>{selected.role === "ADMIN" ? "Administrador" : "Consultor"}</small></div></div>
            <div className="network-chat-messages">
              {loading && <p className="network-chat-info">Carregando conversa...</p>}
              {!loading && !messages.length && <p className="network-chat-info">Comece uma nova conversa.</p>}
              {messages.map(message => <div key={message.id} className={`chat-message ${message.sender_id === currentUser.id ? "mine" : "theirs"}`}>
                <p>{message.body}</p><time>{messageTime(message.created_at)}</time>
              </div>)}
              <div ref={messagesEnd} />
            </div>
            <form className="network-chat-compose" onSubmit={send}>
              <textarea value={draft} onChange={event => setDraft(event.target.value.slice(0, 2000))} onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }} placeholder="Digite uma mensagem" rows={2} disabled={sending} />
              <button type="submit" disabled={sending || !draft.trim()} aria-label="Enviar mensagem">➤</button>
            </form>
          </>}
        </main>
      </div>
      {error && <p className="network-chat-error">{error}</p>}
    </section>}
    <button type="button" className="network-chat-bubble" onClick={() => setOpen(value => !value)} aria-label={open ? "Fechar chat" : "Abrir chat"} aria-expanded={open}>
      <span aria-hidden="true">{open ? "×" : "💬"}</span>
      {unread > 0 && <b>{Math.min(unread, 99)}</b>}
    </button>
  </div>;
}
