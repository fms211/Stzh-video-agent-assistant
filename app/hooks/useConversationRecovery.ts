"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { fetchServerMessages, loadMessages } from "../lib/sync";

type Messages = Awaited<ReturnType<typeof fetchServerMessages>>;

// A history response belongs to the selection that requested it, not whichever
// conversation happens to be visible when the network completes.
export function useConversationRecovery(
  sessionId: string,
  accountId: string | number | undefined,
  hydrated: boolean,
  setMessages: Dispatch<SetStateAction<Messages>>,
  onRecoveryChange?: (state: { scope: string; pending: boolean }) => void,
) {
  const revision = useRef(0);
  const invalidate = useCallback(() => { revision.current += 1; }, []);

  useEffect(() => {
    const requestRevision = ++revision.current;
    const scope = `${accountId ?? "guest"}:${sessionId}`;
    if (!hydrated || accountId === undefined || !sessionId || loadMessages(sessionId).length) {
      onRecoveryChange?.({ scope, pending: false });
      return;
    }
    onRecoveryChange?.({ scope, pending: true });
    void fetchServerMessages(sessionId).then(messages => {
      if (revision.current !== requestRevision || !messages.length) return;
      setMessages(current => revision.current === requestRevision && current.length === 0 ? messages : current);
    }).catch(() => {}).finally(() => {
      if (revision.current === requestRevision) onRecoveryChange?.({ scope, pending: false });
    });
    return invalidate;
  }, [sessionId, accountId, hydrated, setMessages, invalidate, onRecoveryChange]);

  return invalidate;
}
