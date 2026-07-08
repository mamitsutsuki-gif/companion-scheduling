"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** ダッシュボードに条件付きで表示する「セッション申し込み」入り口 */
export function MonthlySessionEntrance() {
  const [show, setShow] = useState(false);
  const [href, setHref] = useState("/sessions-booking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/monthly-session/access", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (cancelled || !res.ok) return;
      if (!data?.show) return;
      setShow(true);
      if (data.role === "PARTNER") setHref("/sessions-booking/partner");
      else if (data.role === "ADMIN") setHref("/admin/monthly-session");
      else setHref("/sessions-booking");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <div className="app-surface-raised rounded-2xl p-5">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-indigo-700 uppercase">
        Session Booking
      </p>
      <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-900">
        セッション申し込み
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        カウンセリング・コーチング・キャリア相談の枠を予約・管理します。
      </p>
      <Link
        href={href}
        className="app-btn-primary mt-4 inline-flex rounded-lg px-4 py-2 text-sm no-underline"
      >
        開く
      </Link>
    </div>
  );
}
