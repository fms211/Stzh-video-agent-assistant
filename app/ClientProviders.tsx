"use client";

import { LiquidGlassProvider } from "./components/LiquidGlassProvider";
import AuthProvider from "@/app/components/AuthProvider";
import HistoryRetentionRuntime from "./components/HistoryRetentionRuntime";
import { PluginRuntimeProvider } from "@/app/components/plugin-slots/PluginRuntimeProvider";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider><HistoryRetentionRuntime /><LiquidGlassProvider><PluginRuntimeProvider>{children}</PluginRuntimeProvider></LiquidGlassProvider></AuthProvider>;
}
