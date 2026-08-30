import { useState } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

function loginUrl(): string {
  const basePath = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return new URL(`${basePath}login`, window.location.origin).toString();
}

export function SignInRecoveryButton() {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const [isReturning, setIsReturning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const returnToSignIn = async () => {
    setIsReturning(true);
    setErrorMessage(null);
    queryClient.clear();

    try {
      if (isSignedIn) {
        await signOut();
      }
      window.location.assign(loginUrl());
    } catch (error) {
      console.error("Unable to return to sign in", error);
      setErrorMessage("We couldn’t sign you out. Please try again.");
      setIsReturning(false);
    }
  };

  return (
    <div className="mt-6">
      <Button
        type="button"
        className="rounded-full"
        disabled={isReturning}
        onClick={returnToSignIn}
      >
        {isReturning ? "Returning to sign in…" : "Return to sign in"}
      </Button>
      {errorMessage ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}