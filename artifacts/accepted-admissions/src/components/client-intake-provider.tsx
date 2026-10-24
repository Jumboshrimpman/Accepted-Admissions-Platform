import { useEffect, useState, type ReactNode } from "react";
import { customFetch } from "@workspace/api-client-react";
import {
  ClientIntakeContext,
  ClientIntakeModal,
} from "@/components/client-intake-modal";
import { emptyIntakeDraft, type ClientIntakeDraft } from "@/lib/client-intake";

type IntakeStatus = { assigned: boolean; completed: boolean };

export function ClientIntakeProvider({
  name,
  email,
  children,
}: {
  name: string;
  email: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [forced, setForced] = useState(false);
  const [draft, setDraft] = useState(() => emptyIntakeDraft({ name, email }));

  useEffect(() => {
    let cancelled = false;
    customFetch<IntakeStatus>("/api/me/client-intake")
      .then((next) => {
        if (!cancelled && next && typeof next.assigned === "boolean") setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus({ assigned: false, completed: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = status?.assigned === true && status.completed === false;
  const open = pending && (forced || !dismissed);

  const submit = async (next: ClientIntakeDraft) => {
    await customFetch("/api/me/client-intake", {
      method: "POST",
      body: JSON.stringify(next),
    });
    setStatus({ assigned: true, completed: true });
    setForced(false);
    setDismissed(true);
  };

  return (
    <ClientIntakeContext.Provider value={{ status, openIntake: () => setForced(true) }}>
      {children}
      <ClientIntakeModal
        open={open}
        draft={draft}
        onDraft={setDraft}
        onClose={() => {
          setDismissed(true);
          setForced(false);
        }}
        onSubmit={submit}
      />
    </ClientIntakeContext.Provider>
  );
}
