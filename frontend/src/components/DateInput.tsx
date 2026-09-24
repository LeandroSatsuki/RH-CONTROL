import { InputHTMLAttributes, useRef } from "react";

export function DateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const ref = useRef<HTMLInputElement>(null);
  return <span className="date-input"><input {...props} ref={ref} type="date" /><button type="button" aria-label="Abrir calendário" disabled={props.disabled || props.readOnly} onClick={() => {
    try { ref.current?.showPicker(); } catch { ref.current?.focus(); }
  }}>▦</button></span>;
}
