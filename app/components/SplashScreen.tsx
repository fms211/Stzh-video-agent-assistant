"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ArrowRight, CircleDot } from "lucide-react";

gsap.registerPlugin(useGSAP);

type Props = { onEnter: () => void };

export default function SplashScreen({ onEnter }: Props) {
  const scope = useRef<HTMLDivElement>(null);
  const [igniting, setIgniting] = useState(false);

  useGSAP(() => {
    gsap.set(".splash-core__flare", { scale: 0.76, opacity: 0.26 });
  }, { scope });

  const startEnter = useCallback(() => {
    if (igniting) return;
    setIgniting(true);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.setTimeout(onEnter, 160);
      return;
    }

    const flare = scope.current?.querySelector(".splash-core__flare");
    gsap.timeline({ onComplete: onEnter })
      .to(flare || [], {
        scale: 1.32,
        opacity: 0.72,
        duration: 0.22,
        ease: "power2.out",
      })
      .to(flare || [], {
        scale: 0.92,
        opacity: 0.34,
        duration: 0.26,
        ease: "power3.inOut",
      }, ">-0.04");
  }, [igniting, onEnter]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      startEnter();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startEnter]);

  return (
    <section ref={scope} className="entry-stage entry-stage--splash" aria-label="产品启动入口">
      <div className="entry-stage__copy">
        <div className="entry-eyebrow"><CircleDot size={13} /> 腾昇智和 · 视频智能体</div>
        <h1>点火，进入创作工作区</h1>
        <p>从一句话到分镜、素材与成片，智能体一次完成。</p>
        <button
          type="button"
          className="entry-primary-action"
          onClick={startEnter}
          disabled={igniting}
        >
          <span>{igniting ? "正在进入…" : "点火并继续"}</span>
          <ArrowRight size={17} />
        </button>
        <span className="entry-key-hint">也可按 Enter 或 Space</span>
      </div>

      <div className="entry-stage__visual" aria-hidden="true">
        <motion.div
          layoutId="brand-core"
          className={`splash-core ${igniting ? "is-igniting" : ""}`}
          transition={{ type: "spring", stiffness: 180, damping: 24 }}
        >
          <span className="splash-core__flare" />
          <span className="splash-core__surface" />
          <span className="splash-core__highlight" />
        </motion.div>
        <div className="entry-telemetry">
          <span>智能体就绪</span>
          <strong>{igniting ? "同步中" : "就绪"}</strong>
        </div>
      </div>
    </section>
  );
}
