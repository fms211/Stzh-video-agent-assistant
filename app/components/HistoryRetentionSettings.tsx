"use client";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import SquishSwitch from "./SquishSwitch";
import { readRetentionPolicy, saveRetentionPolicy, type RetentionPolicy } from "../lib/history-retention-client";

export default function HistoryRetentionSettings() {
  const { user } = useAuth();
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [days, setDays] = useState(30);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let current = true;
    setPolicy(null); setConfirm(false); setError(""); setMessage("");
    if (user) void readRetentionPolicy().then(value => { if (current) { setPolicy(value); setDays(value.days); } }).catch(cause => { if (current) setError(cause.message); });
    return () => { current = false; };
  }, [user?.id, revision]);
  async function save(enabled: boolean) {
    setBusy(true); setError(""); setMessage("");
    try { setPolicy(await saveRetentionPolicy({ enabled, days }, enabled)); setConfirm(false); setMessage(enabled ? "自动清理已开启；访问时及页面保持打开期间定期检查。" : "自动清理已关闭，已清理的历史不会恢复。"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "清理设置未保存，请重试"); }
    finally { setBusy(false); }
  }
  if (!user) return <p className="cws-studio__hint">登录后可设置当前账号的历史清理；默认关闭。</p>;
  return <div className="cws-studio__toggles">
    <label className="cws-check"><SquishSwitch checked={!!policy?.enabled} disabled={!policy || busy} onChange={event => event.target.checked ? setConfirm(true) : void save(false)} />自动清理过期对话</label>
    <label className="cws-studio__row">保留天数<input type="number" min={1} max={90} step={1} disabled={!policy || busy} value={days} onChange={event => { const value = event.currentTarget.valueAsNumber; if (Number.isSafeInteger(value) && value >= 1 && value <= 90) setDays(value); }} /></label>
    <p className="cws-studio__hint">默认关闭。只清理当前账号过期对话，保留当前会话和未结束任务关联会话；作品、记忆、研究与协作记录不删除。离线窗口及未完成或结果未确认的工作流会话暂保留。</p>
    {confirm && <div className="cws-studio__hint" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setConfirm(false); } }}><p>确认开启后，超过{days}天的符合条件对话会自动删除，无法撤销。请先导出需要保留的内容。</p><button className="cws-btn" type="button" disabled={busy} onClick={() => setConfirm(false)}>取消</button><button className="cws-btn cws-btn--danger" type="button" disabled={busy} onClick={() => void save(true)}>确认开启</button></div>}
    {!confirm && policy?.enabled && days !== policy.days && <button className="cws-btn" type="button" disabled={busy} onClick={() => setConfirm(true)}>确认修改保留天数</button>}
    {error && <div className="cws-studio__hint" role="alert"><p>{error}</p><button type="button" className="cws-btn" disabled={busy} onClick={() => setRevision(value => value + 1)}>重新读取设置</button></div>}
    {message && <p className="cws-studio__hint" role="status">{message}</p>}
  </div>;
}
