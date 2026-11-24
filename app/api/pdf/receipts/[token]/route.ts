import { NextResponse } from "next/server"
import { getPublicReceipt } from "@/lib/money/payment-settle"
import { renderReceiptPdf } from "@/lib/pdf/receipts"

/** GET /api/pdf/receipts/[token] — token-gated public receipt PDF. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const r = await getPublicReceipt(token)
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 })

  const pdf = await renderReceiptPdf(r)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${r.receiptNumber ?? token}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  })
}
