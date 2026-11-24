"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptInvite } from "@/lib/staff/actions";
import { acceptWorkspaceInviteAction } from "@/lib/staff/workspace-actions";
import { Button } from "@/components/brand/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/brand/card";
import { Wrench } from "lucide-react";

type State =
  | { kind: "working" }
  | { kind: "done"; href: string }
  | { kind: "error"; message: string }
  | { kind: "signed-out" };

export function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Garage invites live on memberships; vendor/broker/tow invites on
      // workspace_invites. Try the garage flow first, then the shared one.
      const garage = await acceptInvite(token);
      if (cancelled) return;
      if (garage.ok) {
        setState({ kind: "done", href: `/g/${garage.data.garageSlug}` });
      } else if (garage.error.code === "NOT_FOUND") {
        const ws = await acceptWorkspaceInviteAction(token);
        if (cancelled) return;
        if (ws.ok) {
          setState({ kind: "done", href: ws.data.href });
        } else if (ws.error.code === "UNAUTHENTICATED") {
          setState({ kind: "signed-out" });
        } else {
          setState({ kind: "error", message: ws.error.message });
        }
      } else if (garage.error.code === "UNAUTHENTICATED") {
        setState({ kind: "signed-out" });
      } else {
        setState({ kind: "error", message: garage.error.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (state.kind !== "done") return;
    const t = setTimeout(() => {
      router.push(state.href);
      router.refresh();
    }, 1200);
    return () => clearTimeout(t);
  }, [state, router]);

  return (
    <main className="bg-background flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="border-border bg-primary text-primary-foreground shadow-chunky-sm mb-2 flex size-14 items-center justify-center rounded-full border-2">
            <Wrench className="size-7" />
          </span>
          <CardTitle className="text-2xl">FixAm invite</CardTitle>
          <CardDescription>
            {state.kind === "working" && "Accepting your invite…"}
            {state.kind === "done" && "You're in! Taking you to the workspace…"}
            {state.kind === "signed-out" &&
              "Sign in with the phone or email this invite was sent to."}
            {state.kind === "error" && state.message}
          </CardDescription>
        </CardHeader>
        {state.kind === "signed-out" && (
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/login?next=/invite/${token}`}>Sign in to accept</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
