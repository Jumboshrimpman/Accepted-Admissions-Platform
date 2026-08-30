import { useState } from "react";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";

export function ProvisioningReference() {
  const { user } = useUser();
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const copyAccountReference = async () => {
    await navigator.clipboard.writeText(user.id);
    setCopied(true);
  };

  return (
    <div className="mt-5 rounded-xl border bg-muted/40 p-4 text-left">
      <p className="text-sm font-medium">Development account reference</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sign-in succeeded. An administrator must add this exact Clerk user ID
        to the matching preview role allowlist.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 overflow-x-auto rounded bg-background px-3 py-2 text-xs">
          {user.id}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyAccountReference}
        >
          {copied ? "Copied" : "Copy ID"}
        </Button>
      </div>
    </div>
  );
}