"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/auth/supabase/client"
import { Button } from "@/components/brand/button"
import { Card, CardContent } from "@/components/brand/card"
import { Bell } from "lucide-react"

export type ShellNotification = {
  id: string
  title: string
  body: string | null
  link: string | null
  kind: string
  createdAt: string
  readAt: string | null
}

/** Unread badge + dropdown; subscribes to Supabase Realtime inserts. */
export function NotificationsBell({
  garageId,
  userId,
  initial,
}: {
  garageId: string
  userId: string
  initial: ShellNotification[]
}) {
  const [items, setItems] = useState(initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${garageId}:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Record<string, unknown>
          setItems((prev) => [
            {
              id: n.id as string,
              title: n.title as string,
              body: (n.body as string) ?? null,
              link: (n.link as string) ?? null,
              kind: n.kind as string,
              createdAt: n.created_at as string,
              readAt: null,
            },
            ...prev,
          ].slice(0, 20))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [garageId, userId])

  const unread = items.filter((i) => !i.readAt).length

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        className="relative min-h-11 min-w-11 px-3"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full border-2 border-border bg-danger text-[10px] font-bold text-danger-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <Card className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)]">
            <CardContent className="p-0">
              <p className="border-b-2 border-border px-4 py-3 text-sm font-bold">
                Notifications
              </p>
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  You&apos;re all caught up.
                </p>
              ) : (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                  {items.map((n) => (
                    <li key={n.id} className="px-4 py-3">
                      <p className="text-sm font-bold">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString("en-GH")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
