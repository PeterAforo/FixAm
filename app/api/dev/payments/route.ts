import { NextResponse } from "next/server"
import { connection } from "next/server"
import { listMockTransactions, setMockTransactionStatus } from "@/lib/integrations/payments/mock"

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  await connection()
  return NextResponse.json(listMockTransactions())
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const body = (await request.json()) as { reference?: string; status?: "success" | "failed" }
  if (!body.reference || (body.status !== "success" && body.status !== "failed")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const ok = setMockTransactionStatus(body.reference, body.status)
  return NextResponse.json({ ok })
}
