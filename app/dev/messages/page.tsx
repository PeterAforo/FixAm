import { notFound } from "next/navigation"
import { connection } from "next/server"
import { listMockMessages } from "@/lib/integrations/messaging/mock"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/brand/card"
import { StatusPill } from "@/components/brand/status-pill"

export default async function DevMessagesPage() {
  if (process.env.NODE_ENV === "production") notFound()
  await connection() // dev inbox is always dynamic

  const messages = await listMockMessages()

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold">Dev inbox</h1>
        <p className="text-muted-foreground">
          Mock provider captures — SMS, WhatsApp, email and push land here.
        </p>
      </header>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No messages yet. Send one via the app or the Inngest function.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...messages].reverse().map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {m.channel.toUpperCase()} → {m.to}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <StatusPill status={m.status} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.at).toLocaleString("en-GH")}
                    </span>
                  </div>
                </div>
                <p className="text-xs font-mono text-muted-foreground">
                  {m.templateKey} · {m.provider} · {m.costUnits} unit{m.costUnits === 1 ? "" : "s"}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {m.subject && <p className="font-bold">{m.subject}</p>}
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
