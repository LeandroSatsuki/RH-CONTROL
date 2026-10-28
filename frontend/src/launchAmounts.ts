// Parse reais, never shift digits to cents while the user is typing.
export function parseLaunchAmount(raw: string): number | null {
  const value = raw.trim().replace(/^R\$\s*/, "");
  if (!value) return 0;
  let normalized: string;
  if (value.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{0,2}$/.test(value)) return null;
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    normalized = value.replace(/\./g, "");
  } else {
    if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return null;
    normalized = value;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= 1e9 ? Math.round(amount * 100) / 100 : null;
}
