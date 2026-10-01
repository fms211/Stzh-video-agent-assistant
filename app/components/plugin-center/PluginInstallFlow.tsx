"use client";

// 插件中心 — 四步安装向导（规划 Task 12 Step 4）
// 固定 stepper：来源 → manifest/依赖/脚本 → 权限/沙箱 → 最终确认。
// 未签名、开放互联网脚本、full tier、无强沙箱分别使用独立风险行，不折叠成泛化警告。

import SquishSwitch from "@/app/components/SquishSwitch";
import { useCallback, useState } from "react";
import { AlertTriangle, ShieldAlert, Globe, Box, X } from "lucide-react";
import type { PluginCenterAdapter } from "@/app/lib/plugin-center/adapter";
import type { InstallConfirmation, InstallPreview, PluginPermissionTier, PluginSource } from "@/app/lib/plugin-center/types";
import { PluginDialog } from "./PluginDialog";

type Props = {
  adapter: PluginCenterAdapter;
  source: PluginSource;
  onClose: () => void;
  onInstalled: (preview: InstallPreview) => void;
};

const TIER_LABEL: Record<PluginPermissionTier, string> = { safe: "安全", standard: "标准", full: "完全" };
const STEPS = ["来源", "Manifest / 依赖 / 脚本", "权限 / 沙箱", "最终确认"] as const;

export function PluginInstallFlow({ adapter, source, onClose, onInstalled }: Props) {
  const [step, setStep] = useState(0);
  const [spec, setSpec] = useState(source.type === "npm" ? source.spec : "");
  const [gitUrl, setGitUrl] = useState(source.type === "git" ? source.url : "");
  const [gitRef, setGitRef] = useState(source.type === "git" ? (source.ref ?? "") : "");
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [acceptedTier, setAcceptedTier] = useState<PluginPermissionTier>("standard");
  const [acceptsUnsigned, setAcceptsUnsigned] = useState(false);
  const [acceptsInternetScripts, setAcceptsInternetScripts] = useState(false);
  const [acceptsWeakSandbox, setAcceptsWeakSandbox] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const effectiveSource: PluginSource =
    source.type === "npm" ? { type: "npm", spec } : source.type === "git" ? { type: "git", url: gitUrl, ref: gitRef || null } : source;

  const resolve = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await adapter.resolveSource(effectiveSource);
      setPreview(result);
      setAcceptedTier(result.manifest.requestedPermissionTier);
      setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "来源解析失败");
    } finally {
      setBusy(false);
    }
  }, [adapter, effectiveSource]);

  const confirmInstall = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const confirmation: InstallConfirmation = {
        previewHash: preview.previewHash,
        acceptedPermissionTier: acceptedTier,
        acceptsUnsignedRisk: acceptsUnsigned || preview.signatureStatus === "verified",
        acceptsOpenInternetBuildScripts: acceptsInternetScripts,
        acceptsWeakSandboxRisk: acceptsWeakSandbox || preview.strongSandboxAvailable,
      };
      await adapter.install(preview.previewId, confirmation);
      onInstalled(preview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "安装失败");
    } finally {
      setBusy(false);
    }
  }, [adapter, preview, acceptedTier, acceptsUnsigned, acceptsInternetScripts, acceptsWeakSandbox, onInstalled]);

  const needsUnsignedRisk = Boolean(preview && preview.signatureStatus !== "verified");
  const needsInternetRisk = Boolean(preview && preview.buildScripts.length > 0);
  const needsFullRisk = Boolean(preview && preview.manifest.requestedPermissionTier === "full");
  const needsSandboxRisk = Boolean(preview && !preview.strongSandboxAvailable);
  const allRisksAccepted = (!needsUnsignedRisk || acceptsUnsigned) && (!needsInternetRisk || acceptsInternetScripts) && (!needsSandboxRisk || acceptsWeakSandbox);

  return (
    <PluginDialog label="插件安装向导" busy={busy} onClose={onClose}>
      <div className="pc-stepper__panel">
        <div className="pc-stepper__head">
          <h3>安装插件</h3>
          <button type="button" className="pc-btn" aria-label="关闭安装向导" onClick={onClose} disabled={busy}>
            <X aria-hidden="true" size={13} />
          </button>
        </div>

        <div className="pc-steps" aria-label="安装步骤">
          {STEPS.map((label, index) => (
            <span key={label} className={`pc-step-dot${index === step ? " is-active" : ""}${index < step ? " is-done" : ""}`}>
              {index + 1}. {label}
            </span>
          ))}
        </div>

        <div className="pc-stepper__body">
          {/* Step 1: 来源 */}
          {step === 0 && (
            <div className="pc-source-fields">
              {source.type === "catalog" && (
                <p className="pc-manifest-block">
                  市场来源：<b>{source.catalogId}</b> @ v{source.version}
                </p>
              )}
              {source.type === "npm" && (
                <label>
                  npm 包规格（name@version / tag）
                  <input value={spec} onChange={(event) => setSpec(event.target.value)} placeholder="@community/narrative-flow@0.3.1" />
                </label>
              )}
              {source.type === "git" && (
                <>
                  <label>
                    Git 仓库 URL
                    <input value={gitUrl} onChange={(event) => setGitUrl(event.target.value)} placeholder="https://github.com/…" />
                  </label>
                  <label>
                    ref（tag / branch / commit，tag 将锁定精确版本）
                    <input value={gitRef} onChange={(event) => setGitRef(event.target.value)} placeholder="v1.2.0" />
                  </label>
                </>
              )}
              {source.type === "local" && (
                <p className="pc-manifest-block">
                  本地包：<b>{source.fileName}</b>（内容哈希 {source.contentHash ? source.contentHash.slice(0, 12) + "…" : "待上传计算"}）
                </p>
              )}
              {error && (
                <p className="pc-risk-row" role="alert">
                  <AlertTriangle aria-hidden="true" size={14} /> {error}
                </p>
              )}
            </div>
          )}

          {/* Step 2: manifest / 依赖 / 脚本 */}
          {step === 1 && preview && (
            <>
              <div className="pc-manifest-block">
                <h4>{preview.manifest.name}</h4>
                <p>
                  {preview.manifest.description}
                  <br />
                  解析结果：<b>{preview.resolvedRef}</b>（不可变锁定）
                  <br />
                  内容哈希（SHA-256）：<code>{preview.contentHash.slice(0, 24)}…</code>
                </p>
              </div>
              <div className="pc-manifest-block">
                <h4>依赖（{preview.dependencies.length}）</h4>
                {preview.dependencyLockHash && <p>依赖已锁定：<code>{preview.dependencyLockHash.slice(0, 16)}…</code></p>}
                {preview.dependencies.length ? (
                  <ul>
                    {preview.dependencies.map((dep) => (
                      <li key={dep.name}>
                        {dep.name} {dep.version}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>无第三方依赖</p>
                )}
              </div>
              <div className="pc-manifest-block">
                <h4>构建脚本（{preview.buildScripts.length}）</h4>
                {preview.buildScripts.length ? (
                  <ul>
                    {preview.buildScripts.map((script) => (
                      <li key={script.name}>
                        {script.name}: <code>{script.command}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>无构建脚本</p>
                )}
              </div>
            </>
          )}

          {/* Step 3: 权限 / 沙箱（独立风险行） */}
          {step === 2 && preview && (
            <>
              <div className="pc-manifest-block">
                <h4>权限档确认</h4>
                <p>
                  插件请求 <b>{TIER_LABEL[preview.manifest.requestedPermissionTier]}</b> 权限（最低档，不可降低启用）。
                </p>
              </div>
              {needsUnsignedRisk && (
                <label className="pc-risk-row">
                  <SquishSwitch checked={acceptsUnsigned} onChange={(event) => setAcceptsUnsigned(event.target.checked)} />
                  <span>
                    <ShieldAlert aria-hidden="true" size={13} /> <b>未签名包</b>：无法验证发布者身份，包内容可能被篡改。确认接受安装未签名插件的风险。
                  </span>
                </label>
              )}
              {needsInternetRisk && (
                <label className="pc-risk-row">
                  <SquishSwitch checked={acceptsInternetScripts} onChange={(event) => setAcceptsInternetScripts(event.target.checked)} />
                  <span>
                    <Globe aria-hidden="true" size={13} /> <b>构建脚本开放互联网</b>：安装脚本可访问网络并下载二次载荷；宿主密钥与项目目录不进入脚本环境。确认接受。
                  </span>
                </label>
              )}
              {needsFullRisk && (
                <div className="pc-risk-row">
                  <AlertTriangle aria-hidden="true" size={14} />
                  <span>
                    <b>完全（full）权限</b>：允许受控任务创建、artifact 写入与 subprocess 请求；仍不能读取模型密钥、JWT、SQLite 或其他账户数据。项目启用时将要求逐项确认。
                  </span>
                </div>
              )}
              {needsSandboxRisk && (
                <label className="pc-risk-row">
                  <SquishSwitch checked={acceptsWeakSandbox} onChange={(event) => setAcceptsWeakSandbox(event.target.checked)} />
                  <span>
                    <Box aria-hidden="true" size={13} /> <b>无强沙箱</b>：当前环境仅提供进程级隔离，非强安全边界。确认在高风险提示后运行该插件。
                  </span>
                </label>
              )}
              {!needsUnsignedRisk && !needsInternetRisk && !needsFullRisk && !needsSandboxRisk && (
                <div className="pc-risk-row pc-risk-row--safe">
                  <ShieldAlert aria-hidden="true" size={14} />
                  <span>已签名、无开放互联网脚本、无弱沙箱风险——标准安装。</span>
                </div>
              )}
            </>
          )}

          {/* Step 4: 最终确认 */}
          {step === 3 && preview && (
            <div className="pc-manifest-block">
              <h4>确认安装</h4>
              <p>
                {preview.manifest.name} v{preview.manifest.version}
                <br />
                来源锁定：{preview.resolvedRef}
                <br />
                权限档：{TIER_LABEL[acceptedTier]}
                <br />
                签名：{preview.signatureStatus === "verified" ? "已验证" : "未签名（已确认风险）"}
                <br />
                强沙箱：{preview.strongSandboxAvailable ? "可用" : "不可用（已确认进程级隔离风险）"}
              </p>
              <p style={{ marginTop: 8 }}>安装只写入账户插件库；项目启用与 Generation 重建在「项目插件」中单独进行。</p>
              {error && (
                <p className="pc-risk-row" role="alert">
                  <AlertTriangle aria-hidden="true" size={14} /> {error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="pc-stepper__foot">
          <button type="button" className="pc-btn" disabled={busy || step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            上一步
          </button>
          {step === 0 && (
            <button type="button" className="pc-btn pc-btn--primary" disabled={busy} onClick={() => void resolve()}>
              {busy ? "解析中…" : "解析来源"}
            </button>
          )}
          {step === 1 && (
            <button type="button" className="pc-btn pc-btn--primary" onClick={() => setStep(2)}>
              下一步：权限与沙箱
            </button>
          )}
          {step === 2 && (
            <button type="button" className="pc-btn pc-btn--primary" disabled={!allRisksAccepted} onClick={() => setStep(3)}>
              下一步：最终确认
            </button>
          )}
          {step === 3 && (
            <button type="button" className="pc-btn pc-btn--primary" disabled={busy} onClick={() => void confirmInstall()}>
              {busy ? "安装中…" : "确认安装"}
            </button>
          )}
        </div>
      </div>
    </PluginDialog>
  );
}
