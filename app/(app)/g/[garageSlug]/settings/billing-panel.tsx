"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/brand/button";
import { Card, CardContent } from "@/components/brand/card";
import { StatusPill } from "@/components/brand/status-pill";
import { changePlan } from "@/lib/billing/actions";
import { startSubscriptionCheckout } from "@/lib/billing/pay-actions";
import { SubscriptionPayButton } from "@/components/billing/pay-button";

type Plan = {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  maxBranches: number | null;
  maxStaff: number | null;
  messageAllowance: number;
  features: string[];
};

type Billing = {
  planCode: string | null;
  planName: string | null;
  status: string;
  isComplimentary: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  accessState: "ok" | "grace" | "readonly";
  accessReason: string | null;
  maxStaff: number | null;
  maxBranches: number | null;
  plans: Plan[];
};

const gh = (pesewas: number) =>
  `GH₵ ${pesewas.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;

export function BillingPanel({ garageId, billing }: { garageId: string; billing: Billing }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState(billing.planCode ?? "");

  function submit() {
    if (!selected || selected === billing.planCode) return;
    setMsg(null);
    startTransition(async () => {
      const res = await changePlan({ garageId, planCode: selected });
      if (!res.ok) {
        setMsg({ ok: false, text: res.error.message });
        return;
      }
      // Non-complimentary plans bill monthly — send the owner to checkout for
      // the new plan's price; the subscription activates on payment.
      if (!billing.isComplimentary) {
        const pay = await startSubscriptionCheckout({ garageId });
        if (pay.ok) {
          window.location.href = pay.data.checkoutUrl;
          return;
        }
        setMsg({ ok: true, text: "Plan updated — complete payment below to activate it." });
      } else {
        setMsg({ ok: true, text: "Plan updated." });
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[15px] font-semibold">{billing.planName ?? "No plan"}</p>
              <p className="text-muted-foreground text-xs">
                {billing.isComplimentary
                  ? "Complimentary (pilot)"
                  : `Status: ${billing.status.replace(/_/g, " ")}`}
                {billing.trialEndsAt
                  ? ` · trial ends ${new Date(billing.trialEndsAt).toLocaleDateString("en-GH")}`
                  : ""}
                {billing.currentPeriodEnd
                  ? ` · period ends ${new Date(billing.currentPeriodEnd).toLocaleDateString("en-GH")}`
                  : ""}
              </p>
            </div>
            <StatusPill status={billing.accessState === "ok" ? "active" : billing.accessState} />
          </div>
          {billing.accessState !== "ok" && (
            <p className="bg-warning/10 text-warning mt-2 rounded-lg p-2 text-sm">
              {billing.accessState === "grace"
                ? `Payment issue (${billing.accessReason}) — update billing within the grace period to keep writing.`
                : `Garage is read-only (${billing.accessReason}). Choose a plan below to restore access.`}
            </p>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            Limits: {billing.maxStaff != null ? `${billing.maxStaff} staff` : "unlimited staff"} ·{" "}
            {billing.maxBranches != null ? `${billing.maxBranches} branches` : "unlimited branches"}
          </p>
        </CardContent>
      </Card>

      {!billing.isComplimentary && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-display text-base font-bold">Change plan</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {billing.plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.code)}
                  className={`rounded-xl border p-3 text-left transition-colors ${selected === p.code ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"}`}
                >
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm">{gh(p.priceMonthly)}/mo</p>
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    {p.maxStaff != null ? `${p.maxStaff} staff` : "∞ staff"} · {p.messageAllowance}{" "}
                    msgs/mo
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                disabled={pending || !selected || selected === billing.planCode}
                onClick={submit}
              >
                {selected && selected !== billing.planCode
                  ? `Switch to ${billing.plans.find((p) => p.code === selected)?.name}`
                  : "Current plan"}
              </Button>
              {msg && (
                <p className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>
                  {msg.text}
                </p>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              Plan changes apply immediately. Pay by Mobile Money or card below.
            </p>
          </CardContent>
        </Card>
      )}

      {!billing.isComplimentary && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h3 className="font-display text-base font-bold">Pay subscription</h3>
              <p className="text-muted-foreground text-xs">
                {billing.planName ?? "Plan"} — GH₵{" "}
                {(
                  (billing.plans.find((p) => p.code === billing.planCode)?.priceMonthly ?? 0) / 100
                ).toFixed(2)}
                /month via theTeller (MoMo or card).
              </p>
            </div>
            <SubscriptionPayButton owner={{ kind: "garage", garageId }} label="Pay now" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
