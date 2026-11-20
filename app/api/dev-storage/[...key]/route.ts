import { NextResponse } from "next/server"
import { readMockStorage } from "@/lib/integrations/storage/mock"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const { key } = await params
  const file = await readMockStorage(key.join("/"))
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return new NextResponse(new Uint8Array(file))
}
