"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Alert = {
  year: number;
  month: number;
  reason: "current_month_end" | "previous_month_unsubmitted";
  label: string;
};

export function PartnerInvoiceAlert() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/me/invoice-alerts", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as { alerts?: Alert[] } | null;
      if (!cancelled && json?.alerts) setAlerts(json.alerts);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={`${a.year}-${a.month}-${a.reason}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
        >
          <p className="font-semibold">🧾 {a.label}</p>
          <Link
            href={`/partner/invoices?year=${a.year}&month=${a.month}`}
            className="inline-flex items-center rounded-md bg-amber-700 px-3 py-1.5 font-semibold !text-white no-underline hover:bg-amber-800"
          >
            請求書を開く
          </Link>
        </div>
      ))}
    </div>
  );
}
