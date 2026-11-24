"use client";

import { useEffect, useState } from "react";

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(date: Date, now = Date.now()) {
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "justo ahora";
}

/** "hace 5 minutos", actualizado cada minuto. */
export function RelativeTime({ iso }: { iso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={date.toLocaleString("es")} suppressHydrationWarning>
      {formatRelative(date, now)}
    </time>
  );
}
