/** Official endpoints checked 2026-09-30. Model IDs always come from discovery. */
export type ProviderFormValue = {
  name: string; vendorId: string; websiteUrl: string; protocol: "openai" | "anthropic";
  baseUrl: string; model: string; apiKey: string; makeActive: boolean;
  contextWindowTokens: string; maxOutputTokens: string; safetyMarginTokens: string;
  outputTokenParameter: "max_tokens" | "max_completion_tokens";
  thinkingMode: "default" | "enabled" | "disabled";
};
export type ProviderPreset = Pick<ProviderFormValue, "vendorId" | "name" | "websiteUrl" | "protocol" | "baseUrl" | "outputTokenParameter" | "thinkingMode">;
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { vendorId: "mimo", name: "小米 MiMo", websiteUrl: "https://platform.xiaomimimo.com", protocol: "openai", baseUrl: "https://api.xiaomimimo.com/v1", outputTokenParameter: "max_completion_tokens", thinkingMode: "disabled" },
  { vendorId: "deepseek", name: "DeepSeek", websiteUrl: "https://platform.deepseek.com", protocol: "openai", baseUrl: "https://api.deepseek.com/v1", outputTokenParameter: "max_tokens", thinkingMode: "default" },
  { vendorId: "openai", name: "OpenAI", websiteUrl: "https://platform.openai.com", protocol: "openai", baseUrl: "https://api.openai.com/v1", outputTokenParameter: "max_completion_tokens", thinkingMode: "default" },
  { vendorId: "anthropic", name: "Anthropic", websiteUrl: "https://platform.claude.com", protocol: "anthropic", baseUrl: "https://api.anthropic.com", outputTokenParameter: "max_tokens", thinkingMode: "default" },
  { vendorId: "qwen", name: "通义千问 · 百炼", websiteUrl: "https://bailian.console.aliyun.com", protocol: "openai", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", outputTokenParameter: "max_tokens", thinkingMode: "default" },
  { vendorId: "siliconflow", name: "硅基流动", websiteUrl: "https://cloud.siliconflow.cn", protocol: "openai", baseUrl: "https://api.siliconflow.cn/v1", outputTokenParameter: "max_tokens", thinkingMode: "default" },
  { vendorId: "openrouter", name: "OpenRouter", websiteUrl: "https://openrouter.ai", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", outputTokenParameter: "max_tokens", thinkingMode: "default" },
];
export const emptyProvider: ProviderFormValue = {
  ...PROVIDER_PRESETS[1], model: "", apiKey: "", makeActive: true,
  contextWindowTokens: "", maxOutputTokens: "2000", safetyMarginTokens: "1024",
};
export function applyProviderPreset(value: ProviderFormValue, vendorId: string): ProviderFormValue {
  const preset = PROVIDER_PRESETS.find(item => item.vendorId === vendorId);
  if (!preset) return { ...value, vendorId: "custom" };
  // Credentials and a stale model ID must never follow a different vendor.
  return { ...value, ...preset, apiKey: "", model: "", contextWindowTokens: "" };
}
export function safeWebsiteUrl(value: string): string | null {
  try { const url = new URL(value);return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
