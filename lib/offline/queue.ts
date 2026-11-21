"use client"

/**
 * Offline action queue — localStorage-backed, flushed on 'online'.
 * Every queued action carries a clientId for server-side idempotency.
 */

export type QueuedAction = {
  id: string
  kind: "toggleTask" | "startTimer" | "stopTimer" | "addFinding" | "jobStatus"
  payload: Record<string, unknown>
  createdAt: number
  attempts: number
}

const KEY = (garageId: string) => `fixam-offline-queue:${garageId}`

export function queueKey(garageId: string) {
  return KEY(garageId)
}

export function readQueue(garageId: string): QueuedAction[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(KEY(garageId)) ?? "[]") as QueuedAction[]
  } catch {
    return []
  }
}

export function writeQueue(garageId: string, items: QueuedAction[]) {
  localStorage.setItem(KEY(garageId), JSON.stringify(items))
}

export function enqueue(garageId: string, kind: QueuedAction["kind"], payload: Record<string, unknown>) {
  const items = readQueue(garageId)
  items.push({
    id: crypto.randomUUID(),
    kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  })
  writeQueue(garageId, items)
}

export function removeFromQueue(garageId: string, id: string) {
  writeQueue(garageId, readQueue(garageId).filter((q) => q.id !== id))
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine
}

export function newClientId(): string {
  return `cli-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
}
