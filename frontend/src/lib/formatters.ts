import { ApiError } from "./api-client";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos (int) -> "R$ 1.234,56" */
export const money = (cents: number) => brl.format(cents / 100);

/** Aceita "1.234,56", "180", "180,5", "180.50" -> centavos. Retorna null se inválido. */
export function parseMoney(input: string): number | null {
  let s = input.replace(/R\$|\s/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** Centavos -> "1234,56" para preencher inputs. */
export const centsToInput = (cents: number) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");

/** "2026-11-19" -> "19/11/2026" (sem conversão de fuso: datas são do dia local do usuário). */
export const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
  "setembro", "outubro", "novembro", "dezembro"];
export const monthLabel = (m: string) => {
  const name = MONTHS[Number(m.slice(5, 7)) - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${m.slice(0, 4)}`;
};

/** Valor curto para células pequenas: 413 / 1,2 mil. */
export const compactMoney = (cents: number) => {
  const v = cents / 100;
  return v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("pt-BR");
};

export function shiftMonth(m: string, delta: number): string {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthEnd(m: string): string {
  const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  return `${m}-${String(last).padStart(2, "0")}`;
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Extrai uma mensagem legível de um erro da API (inclusive 422 do FastAPI). */
export function errorMessage(err: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    const d = body?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length) {
      const first = d[0] as { msg?: string };
      return (first.msg ?? fallback).replace(/^Value error, /, "");
    }
    if (err.status === 429) return "Muitas tentativas. Aguarde alguns minutos.";
  }
  return fallback;
}

export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}
