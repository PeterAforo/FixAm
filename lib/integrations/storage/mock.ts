import "server-only"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { StorageProvider } from "../types"

/** Mock storage — files land in .dev-storage/ (gitignored), URLs are local paths. */

const ROOT = path.join(process.cwd(), ".dev-storage")

export function createMockStorageProvider(): StorageProvider {
  return {
    name: "mock",

    async put(key, body) {
      const file = path.join(ROOT, key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, body)
      return { key }
    },

    async getSignedUrl(key, expiresInSeconds = 3600) {
      // Dev-only: returns a marker URL; real signed URLs come from Supabase Storage.
      return `/api/dev-storage/${encodeURIComponent(key)}?expires=${Date.now() + expiresInSeconds * 1000}`
    },

    async delete(key) {
      const { unlink } = await import("node:fs/promises")
      await unlink(path.join(ROOT, key)).catch(() => {})
    },
  }
}

export async function readMockStorage(key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(ROOT, key))
  } catch {
    return null
  }
}
