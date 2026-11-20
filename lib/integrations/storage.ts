import "server-only"
import type { StorageProvider } from "./types"
import { createMockStorageProvider } from "./storage/mock"

let cached: StorageProvider | undefined

export function storageProvider(): StorageProvider {
  const selected = process.env.STORAGE_PROVIDER ?? "mock"
  if (selected !== "mock") {
    console.warn(`[integrations] STORAGE_PROVIDER=${selected} not implemented; using mock`)
  }
  if (!cached) cached = createMockStorageProvider()
  return cached
}
