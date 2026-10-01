"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthView } from "@/app/lib/entry-flow";
import { ENTRY_SESSION_KEY } from "@/app/lib/entry-flow";
import ProductShell from "./ProductShell";
import EntryGateway from "./EntryGateway";

export default function AuthEntryPage({ defaultView }: { defaultView: "login" | "register" }) {
  const router = useRouter();
  const [authView, setAuthView] = useState<AuthView>(defaultView);

  const enter = (mode: "authenticated" | "guest") => {
    sessionStorage.setItem(ENTRY_SESSION_KEY, `workspace:${mode}`);
    router.push("/");
  };

  return (
    <ProductShell
      phase="gateway"
      accessMode={null}
      page="studio"
      onPageChange={() => {}}
    >
      <div className="entry-stage entry-stage--gateway">
        <EntryGateway
          authView={authView}
          onAuthViewChange={setAuthView}
          onAuthenticated={() => enter("authenticated")}
          onGuest={() => enter("guest")}
        />
      </div>
    </ProductShell>
  );
}
