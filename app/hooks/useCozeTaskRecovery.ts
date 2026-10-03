"use client";

import { useEffect, useRef, useState } from "react";
import { getTasks, getToken, type LinkedTask } from "../lib/auth";
import { cozeTaskLabel, cozeTaskReply, isActiveCozeTask, readConversationTasks, taskReplyId } from "../lib/coze-task-recovery";
import type { fetchServerMessages } from "../lib/sync";
import type { Dispatch, SetStateAction } from "react";

type Messages = Awaited<ReturnType<typeof fetchServerMessages>>;
export function useCozeTaskRecovery(sessionId: string, accountId: number | undefined, ready: boolean,
  setMessages: Dispatch<SetStateAction<Messages>>, revision: number) {
  const [state, setState] = useState<{ scope: string; tasks: Record<string, LinkedTask>; settled: string[]; loading: boolean; error: string }>({ scope: "", tasks: {}, settled: [], loading: false, error: "" });
  const scope = `${accountId ?? "guest"}:${sessionId}:${getToken() ?? ""}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => {
    if (!ready || accountId === undefined || !sessionId) return;
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const token = getToken();
    const isCurrent = () => !disposed && currentScope.current === scope && getToken() === token;
    setState(old => ({ scope, tasks: old.scope === scope ? old.tasks : {}, settled: [], loading: true, error: "" }));
    async function refresh() {
      try {
        const tasks = await readConversationTasks(sessionId,
          cursor => getTasks({ conversationId: sessionId, limit: 200, cursor }), isCurrent);
        if (!tasks || !isCurrent()) return;
        const active = Object.fromEntries(tasks.filter(isActiveCozeTask).map(task => [taskReplyId(task, sessionId)!, task]));
        setMessages(messages => {
          if (!isCurrent()) return messages;
          const byId = new Map(tasks.map(task => [taskReplyId(task, sessionId), task]));
          let changed = false;
          const next = messages.map(message => {
            const task = byId.get(message.id);
            if (message.role !== "agent" || !task) return message;
            const reply = cozeTaskReply(task);
            if (!reply) return message;
            const updated = { ...message, ...reply };
            if (JSON.stringify(updated) === JSON.stringify(message)) return message;
            changed = true; return updated;
          });
          return changed ? next : messages;
        });
        setState({ scope, tasks: active, settled: tasks.filter(task => !isActiveCozeTask(task)).map(task => taskReplyId(task, sessionId)!), loading: false, error: "" });
      } catch (error) {
        if (!isCurrent()) return;
        setState(old => ({ scope, tasks: old.scope === scope ? old.tasks : {}, settled: [], loading: false,
          error: error instanceof Error ? error.message : "任务进度连接失败" }));
      }
      if (isCurrent()) timer = setTimeout(() => void refresh(), 2500);
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [scope, sessionId, accountId, ready, setMessages, revision]);
  const current: typeof state = state.scope === scope ? state : { scope, tasks: {}, settled: [], loading: ready, error: "" };
  return { ...current, label: Object.values(current.tasks).map(cozeTaskLabel).at(-1) || "" };
}
