import "server-only"
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer"
import { formatGHS } from "@/lib/money"

export type InvoicePdfData = {
  garage: {
    name: string
    address: string | null
    city: string | null
    phone: string | null
    tin: string | null
    invoiceFooter: string | null
    brandColor: string | null
  }
  branchName: string | null
  invoice: {
    number: string | null
    status: string
    issueDate: string | null
    dueDate: string | null
    subtotal: bigint | number
    discountTotal: bigint | number
    taxTotal: bigint | number
    total: bigint | number
    depositApplied: bigint | number | null
    amountPaid: bigint | number
    balanceDue: bigint | number
    notes: string | null
    voidReason: string | null
  }
  customer: { fullName: string; phone: string | null } | null
  vehicle: { plateNumber: string | null; make: string | null; model: string | null; year: number | null } | null
  lines: {
    description: string
    quantity: number
    unitPrice: bigint | number
    lineTotal: bigint | number
    taxBreakdown: { code: string; rate_bp: number }[] | null
  }[]
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#171717" },
  thermalPage: { padding: 16, fontSize: 9, fontFamily: "Helvetica", color: "#171717" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, paddingBottom: 8, marginBottom: 12 },
  garageName: { fontSize: 16, fontWeight: "bold" },
  garageMeta: { fontSize: 8, color: "#525252", marginTop: 2 },
  docTitle: { fontSize: 14, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1 },
  docNumber: { fontFamily: "Courier", fontSize: 10, marginTop: 2 },
  billTo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  col: { width: "48%" },
  label: { fontSize: 7, textTransform: "uppercase", color: "#737373", marginBottom: 2 },
  table: { marginTop: 8 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d4d4d4", paddingVertical: 4 },
  rowHead: { fontSize: 7, textTransform: "uppercase", color: "#737373", fontWeight: "bold" },
  desc: { flex: 1, paddingRight: 6 },
  taxNote: { fontSize: 7, color: "#737373" },
  num: { width: 60, textAlign: "right" },
  numWide: { width: 80, textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 160 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  grandTotal: { borderTopWidth: 1.5, marginTop: 3, paddingTop: 3, fontWeight: "bold", fontSize: 11 },
  footer: { marginTop: 16, borderTopWidth: 0.5, borderTopColor: "#d4d4d4", paddingTop: 6, fontSize: 8, color: "#737373", textAlign: "center" },
  void: { marginTop: 8, textAlign: "center", color: "#b91c1c", fontWeight: "bold", fontSize: 9 },
})

function InvoiceDocument({ data, thermal }: { data: InvoicePdfData; thermal: boolean }) {
  const brand = data.garage.brandColor ?? "#0f172a"
  const s = thermal ? styles.thermalPage : styles.page
  const inv = data.invoice
  const g = data.garage

  return (
    <Document title={`Invoice ${inv.number ?? "draft"} — ${g.name}`} author="FixAm">
      <Page size={thermal ? [226, 841] : "A4"} style={s}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.garageName, { color: brand }]}>{g.name}</Text>
            <Text style={styles.garageMeta}>
              {[g.address, g.city].filter(Boolean).join(", ")}
              {g.phone ? ` · ${g.phone}` : ""}
            </Text>
            {g.tin ? <Text style={styles.garageMeta}>TIN: {g.tin}</Text> : null}
            {data.branchName ? <Text style={styles.garageMeta}>Branch: {data.branchName}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.docTitle, { color: brand }]}>{inv.status === "void" ? "VOID" : "INVOICE"}</Text>
            <Text style={styles.docNumber}>{inv.number ?? "DRAFT"}</Text>
            <Text style={styles.garageMeta}>{inv.issueDate ?? ""}</Text>
          </View>
        </View>

        <View style={styles.billTo}>
          <View style={styles.col}>
            <Text style={styles.label}>Bill to</Text>
            <Text style={{ fontWeight: "bold" }}>{data.customer?.fullName ?? "Walk-in customer"}</Text>
            {data.customer?.phone ? <Text style={styles.garageMeta}>{data.customer.phone}</Text> : null}
          </View>
          <View style={[styles.col, { alignItems: "flex-end" }]}>
            <Text style={styles.garageMeta}>Issued: {inv.issueDate ?? "—"}</Text>
            <Text style={styles.garageMeta}>Due: {inv.dueDate ?? "On receipt"}</Text>
            {data.vehicle ? (
              <Text style={styles.garageMeta}>
                Vehicle: {[data.vehicle.plateNumber, data.vehicle.make, data.vehicle.model, data.vehicle.year].filter(Boolean).join(" ")}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.rowHead]}>
            <Text style={styles.desc}>Item</Text>
            <Text style={styles.num}>Qty</Text>
            {!thermal ? <Text style={styles.num}>Unit</Text> : null}
            <Text style={styles.numWide}>Amount</Text>
          </View>
          {data.lines.map((l, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <View style={styles.desc}>
                <Text>{l.description}</Text>
                {l.taxBreakdown?.length ? (
                  <Text style={styles.taxNote}>
                    {l.taxBreakdown.map((t) => `${t.code} ${(t.rate_bp / 100).toFixed(0)}%`).join(" · ")}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.num}>{Number(l.quantity)}</Text>
              {!thermal ? <Text style={styles.num}>{formatGHS(l.unitPrice)}</Text> : null}
              <Text style={styles.numWide}>{formatGHS(l.lineTotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}><Text>Subtotal</Text><Text>{formatGHS(inv.subtotal)}</Text></View>
          {Number(inv.discountTotal) > 0 ? (
            <View style={styles.totalRow}><Text>Discount</Text><Text>−{formatGHS(inv.discountTotal)}</Text></View>
          ) : null}
          {Number(inv.taxTotal) > 0 ? (
            <View style={styles.totalRow}><Text>Tax</Text><Text>{formatGHS(inv.taxTotal)}</Text></View>
          ) : null}
          <View style={[styles.totalRow, styles.grandTotal]}>
            <Text style={{ color: brand }}>Total</Text><Text>{formatGHS(inv.total)}</Text>
          </View>
          {Number(inv.depositApplied ?? 0) > 0 ? (
            <View style={styles.totalRow}><Text>Deposit applied</Text><Text>−{formatGHS(inv.depositApplied ?? 0)}</Text></View>
          ) : null}
          <View style={styles.totalRow}><Text>Paid</Text><Text>{formatGHS(inv.amountPaid)}</Text></View>
          <View style={[styles.totalRow, { fontWeight: "bold" }]}>
            <Text>Balance due</Text><Text>{formatGHS(inv.balanceDue)}</Text>
          </View>
        </View>

        {inv.notes ? <Text style={[styles.garageMeta, { marginTop: 10 }]}>Notes: {inv.notes}</Text> : null}
        {inv.status === "void" ? (
          <Text style={styles.void}>VOID{inv.voidReason ? ` — ${inv.voidReason}` : ""}</Text>
        ) : null}
        {g.invoiceFooter ? <Text style={styles.footer}>{g.invoiceFooter}</Text> : null}
        <Text style={[styles.footer, { marginTop: 8 }]}>Generated by FixAm</Text>
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(data: InvoicePdfData, thermal = false): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} thermal={thermal} />)
}
