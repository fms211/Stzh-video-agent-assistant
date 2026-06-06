"use client";

import AuthProvider from "@/app/components/AuthProvider";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
