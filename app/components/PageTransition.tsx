"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import type { WorkspacePage } from "./NavigationBar";

type Props = {
  page: WorkspacePage;
  children: React.ReactNode[];
};

const PAGES: WorkspacePage[] = ["chat", "opc", "tasks", "stats", "libtv", "gallery"];

export default function PageTransition({ page, children }: Props) {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [page]);

  const index = PAGES.indexOf(page);

  return (
    <div className="page-transition-container">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={page}
          className="page-panel active"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {children[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
