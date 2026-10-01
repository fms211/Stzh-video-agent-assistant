"use client";

import AuthProvider from "@/app/components/AuthProvider";
import { PluginRuntimeProvider } from "@/app/components/plugin-slots/PluginRuntimeProvider";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider><PluginRuntimeProvider>{children}</PluginRuntimeProvider></AuthProvider>;
}
