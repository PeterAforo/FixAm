import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ ok: true, message: "Inngest handler lands in P0-08" })
}

export async function POST() {
  return NextResponse.json({ ok: true, message: "Inngest handler lands in P0-08" })
}

export async function PUT() {
  return NextResponse.json({ ok: true, message: "Inngest handler lands in P0-08" })
}
