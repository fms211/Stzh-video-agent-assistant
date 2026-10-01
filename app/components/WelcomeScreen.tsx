"use client";

import { motion } from "motion/react";
import { useAuth } from "./AuthProvider";
import { PluginSlot } from "./plugin-slots/PluginSlot";
import { Video, ScrollText, Sparkles, Lightbulb } from "lucide-react";

type Props = { onStart: (initialPrompt?: string) => void };

const QUICK_ACTIONS = [
  { icon: <Video size={17} strokeWidth={1.8} />, label: "生成短视频", prompt: "帮我生成一个短视频" },
  { icon: <ScrollText size={17} strokeWidth={1.8} />, label: "写分镜脚本", prompt: "帮我写一个分镜脚本" },
  { icon: <Sparkles size={17} strokeWidth={1.8} />, label: "优化提示词", prompt: "帮我优化AI生图提示词" },
  { icon: <Lightbulb size={17} strokeWidth={1.8} />, label: "创意灵感", prompt: "给我一些短视频创意灵感" },
];

export default function WelcomeScreen({ onStart }: Props) {
  const { user } = useAuth();
  const name = user?.displayName || user?.username || "创作者";

  return (
    <motion.div
      className="welcome-screen"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      {/* 插件槽位：home.quickActions（additive，Mock 阶段无贡献时不渲染） */}
      <PluginSlot slot="home.quickActions" contributions={[]} projectId="project-a" />
      <div className="welcome-content">
        <div className="welcome-greeting">
          <h1 className="welcome-title page-title">你好，{name}</h1>
          <p className="welcome-subtitle">今天想把什么灵感变成画面？</p>
        </div>
        <div className="welcome-actions">
          {QUICK_ACTIONS.map((action) => (
            <motion.button
              key={action.label}
              type="button"
              className="welcome-action-btn"
              onClick={() => onStart(action.prompt)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="welcome-action-icon">{action.icon}</span>
              <span>{action.label}</span>
            </motion.button>
          ))}
        </div>
        <button type="button" className="welcome-skip" onClick={() => onStart()}>
          直接进入对话
        </button>
      </div>
    </motion.div>
  );
}
