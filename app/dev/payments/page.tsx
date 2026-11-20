"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/brand/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"
import { formatGHS } from "@/lib/money"

type Tx = {
  reference: string
  amountPesewas: string
  kind: string
  status: string
  createdAt: string
}

export default function DevPaymentsPage() {
  const [txs, setTxs] = useState<Tx[]>([])

  const load = useCallback(async () => {
    const res = await fetch("/api/dev/payments")
    if (res.ok) setTxs(await res.json())
  }, [])

  useEffect(() => {
    const id = setInterval(load, 3000)
    const first = setTimeout(load, 0)
    return () => {
      clearInterval(id)
      clearTimeout(first)
    }
  }, [load])

  async function setStatus(reference: string, status: "success" | "failed") {
    await fetch("/api/dev/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference, status }),
    })
    load()
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Dev payments</h1>
        <p className="text-muted-foreground">
          Mock Paystack transactions — complete or fail them to test flows.
        </p>
      </header>

      {txs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No transactions yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {txs.map((tx) => (
            <Card key={tx.reference}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="font-mono text-base">{tx.reference}</CardTitle>
                  <StatusPill status={tx.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {tx.kind} · {new Date(tx.createdAt).toLocaleString("en-GH")}
                </p>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold">
                  {formatGHS(BigInt(tx.amountPesewas))}
                </span>
                {tx.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setStatus(tx.reference, "success")}>
                      Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setStatus(tx.reference, "failed")}
                    >
                      Fail
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
