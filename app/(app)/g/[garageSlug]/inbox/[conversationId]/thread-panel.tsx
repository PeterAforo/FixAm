"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bot, UserCheck } from "lucide-react"
import { Button } from "@/components/brand/button"
import { handBackToAi, staffReply, takeOverConversation } from "@/lib/whatsapp/actions"

type Msg = {
  id: string
  direction: string
  type: string
  body: string | null
  transcript: string | null
  aiToolCalls: unknown
  createdAt: string
}

const time = (iso: string) => new Date(iso).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

export function InboxThread(props: {
  garageId: string
  conversationId: string
  mode: string
  phone: string
  customerName: string | null
  inWindow: boolean
  messages: Msg[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [draft, setDraft] = useState("")
  const [msg, setMsg] = useState<string | null>(null)
  const conversationId = props.conversationId

  function act(fn: () => Promise<{ ok: boolean; error?: { message?: string } }>) {
    start(async () => {
      const res = await fn()
      if (!res.ok) { setMsg(res.error?.message ?? "Couldn't do that"); return }
      setMsg(null); router.refresh()
    })
  }

  function send(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    act(async () => {
      const res = await staffReply({ garageId: props.garageId, conversationId, body: draft.trim() })
      if (res.ok) setDraft("")
      return res
    })
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div>
          <p className="font-semibold">{props.customerName ?? `+${props.phone}`}</p>
          <p className="text-xs text-muted-foreground">
            {props.mode === "ai" ? "AI assistant is replying" : "You have this conversation — AI is paused"}
            {!props.inWindow && " · outside the 24 h window (replies go as a template)"}
          </p>
        </div>
        {props.mode === "ai" ? (
          <Button size="sm" variant="secondary" disabled={pending}
            onClick={() => act(() => takeOverConversation({ garageId: props.garageId, conversationId }))}>
            <UserCheck className="size-4" /> Take over
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={pending}
            onClick={() => act(() => handBackToAi({ garageId: props.garageId, conversationId }))}>
            <Bot className="size-4" /> Hand back to AI
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {props.messages.map((m) => {
          const inbound = m.direction === "in"
          return (
            <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${inbound ? "bg-surface-sunken" : "bg-primary text-primary-foreground"}`}>
                {m.type === "audio" && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">Voice note{m.transcript ? "" : " (not transcribed)"}</p>}
                {m.type === "template" && m.body?.startsWith("[template:") && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">Template</p>}
                <p className="whitespace-pre-wrap break-words">{m.body ?? (m.type === "audio" ? "🎤" : "[media]")}</p>
                {m.transcript && <p className="mt-1 border-t border-current/10 pt-1 text-xs opacity-70">“{m.transcript}”</p>}
                <p className={`mt-1 text-[10px] ${inbound ? "text-muted-foreground" : "text-primary-foreground/70"}`}>{time(m.createdAt)}</p>
              </div>
            </div>
          )
        })}
      </div>

      {msg && <p className="rounded-xl border border-danger/30 bg-danger-subtle px-4 py-3 text-sm font-medium text-danger">{msg}</p>}

      <form onSubmit={send} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={props.mode === "ai" ? "Reply as the team (AI keeps handling new messages unless you take over)" : "Reply to the customer…"}
          className="min-h-11 flex-1 rounded-xl border border-input bg-card px-3.5 text-sm outline-none focus:border-foreground"
        />
        <Button type="submit" loading={pending} disabled={!draft.trim()}>Send</Button>
      </form>
    </div>
  )
}
