"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type Props = { page: "chat" | "opc" | "stats" | "libtv"; children: ReactNode };

export default function PageSwitch({ page, children }: Props) {
  const [showPage, setShowPage] = useState(page);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (page === showPage) return;
    setSwitching(true);
    const t = setTimeout(() => {
      setShowPage(page);
      requestAnimationFrame(() => setSwitching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [page, showPage]);

  const childArr = Array.isArray(children) ? children : [children];

  const idx = showPage === "chat" ? 0 : showPage === "opc" ? 1 : showPage === "stats" ? 2 : 3;

  return (
    <div className={`page-switch ${switching ? "switching" : ""}`}>
      {childArr[idx] || null}
    </div>
  );
}
