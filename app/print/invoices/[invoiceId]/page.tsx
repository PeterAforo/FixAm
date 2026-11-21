import { Suspense } from "react"
import { connection } from "next/server"
import { PrintInvoiceLoader } from "./print-invoice-loader"

async function Loader(props: {
  params: Promise<{ invoiceId: string }>
  searchParams: Promise<{ format?: string }>
}) {
  await connection()
  return <PrintInvoiceLoader {...props} />
}

export default function PrintInvoicePage(props: {
  params: Promise<{ invoiceId: string }>
  searchParams: Promise<{ format?: string }>
}) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-neutral-500">Loading invoice…</div>}>
      <Loader {...props} />
    </Suspense>
  )
}
