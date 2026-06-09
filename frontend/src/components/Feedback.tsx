export function ErrorMessage({ message }: { message: string }) {
  return message ? <div className="feedback error">{message}</div> : null;
}

export function SuccessMessage({ message }: { message: string }) {
  return message ? <div className="feedback success">{message}</div> : null;
}

export function Empty({ children }: { children: string }) {
  return <div className="empty">{children}</div>;
}

export function AppError({
  title,
  message,
  onRetry
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="app-error">
      <section>
        <span className="eyebrow">Sistema indisponível</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <button className="primary" onClick={onRetry}>Tentar novamente</button>
      </section>
    </main>
  );
}
