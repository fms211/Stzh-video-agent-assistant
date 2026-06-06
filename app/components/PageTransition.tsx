"use client";

import { useEffect, useRef, useState } from "react";

type Page = "chat" | "opc" | "stats" | "libtv" | "gallery";

type Props = {
  page: Page;
  children: React.ReactNode[];
};

export default function PageTransition({ page, children }: Props) {
  const [currentPage, setCurrentPage] = useState<Page>(page);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevPageRef = useRef<Page>(page);

  const pages: Page[] = ["chat", "opc", "stats", "libtv", "gallery"];
  const currentIndex = pages.indexOf(page);
  const prevIndex = pages.indexOf(prevPageRef.current);

  useEffect(() => {
    if (page !== prevPageRef.current) {
      setDirection(currentIndex > prevIndex ? "right" : "left");
      setIsTransitioning(true);

      // 动画结束后更新当前页面
      const timer = setTimeout(() => {
        setCurrentPage(page);
        setIsTransitioning(false);
        prevPageRef.current = page;
      }, 400);

      return () => clearTimeout(timer);
    }
  }, [page, currentIndex, prevIndex]);

  const getPageIndex = (p: Page) => pages.indexOf(p);

  return (
    <div className="page-transition-container">
      {children.map((child, index) => {
        const tabPage = pages[index];
        const isActive = tabPage === currentPage;
        const isLeaving = tabPage === prevPageRef.current && isTransitioning;
        const isEntering = tabPage === page && isTransitioning;

        return (
          <div
            key={tabPage}
            className={`page-panel ${isActive ? "active" : ""} ${isLeaving ? "leaving" : ""} ${isEntering ? "entering" : ""}`}
            style={{
              "--direction": direction === "right" ? "-1" : "1",
              "--delay": isEntering ? "0ms" : "0ms",
            } as React.CSSProperties}
          >
            {child}
          </div>
        );
      })}

      <style>{`
        .page-transition-container {
          position: relative;
          width: 100%;
          min-height: 100svh;
          z-index: var(--z-sidebar);
        }

        .page-panel {
          position: absolute;
          inset: 0;
          opacity: 0;
          transform: translateX(calc(var(--direction, 1) * 100%));
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
          will-change: transform, opacity;
        }

        .page-panel.active {
          opacity: 1;
          transform: translateX(0);
          pointer-events: auto;
        }

        .page-panel.leaving {
          opacity: 0;
          transform: translateX(calc(var(--direction, 1) * -30%));
          pointer-events: none;
        }

        .page-panel.entering {
          opacity: 0;
          transform: translateX(calc(var(--direction, 1) * 100%));
          pointer-events: none;
        }

        /* 滚动容器 */
        .page-panel > * {
          width: 100%;
          min-height: 100svh;
        }
      `}</style>
    </div>
  );
}
