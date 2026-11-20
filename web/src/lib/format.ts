export function formatPrice(amount: number, currency: string): string {
  // Fixed locale so server-built chat replies and client UI format money the same way.
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
