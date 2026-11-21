import "server-only"
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer"
import { formatGHS } from "@/lib/money"

export type ReceiptPdfData = {
  garageName: string
  garageAddress: string | null
  garagePhone: string | null
  garageTin: string | null
  garageBrandColor: string | null
  receiptNumber: string | null
  amount: number
  method: string
  paidAt: string | null
  invoiceNumber: string | null
  invoiceBalance: number | null
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", momo: "Mobile Money", card: "Card",
  bank_transfer: "Bank transfer", cheque: "Cheque", credit_account: "Credit account", other: "Other",
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#171717" },
  header: { alignItems: "center", borderBottomWidth: 2, paddingBottom: 14, marginBottom: 18 },
  garageName: { fontSize: 18, fontWeight: "bold" },
  garageMeta: { fontSize: 9, color: "#525252", marginTop: 2 },
  title: { fontSize: 13, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 2, marginTop: 10 },
  receiptNo: { fontFamily: "Courier", fontSize: 10, marginTop: 3, color: "#525252" },
  amount: { fontSize: 26, fontWeight: "bold", marginTop: 16, textAlign: "center" },
  method: { fontSize: 10, color: "#525252", textAlign: "center", marginTop: 2 },
  rows: { marginTop: 20, alignSelf: "center", width: 280 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#e5e5e5" },
  label: { color: "#737373", fontSize: 9, textTransform: "uppercase" },
  footer: { position: "absolute", bottom: 32, left: 40, right: 40, fontSize: 8, color: "#a3a3a3", textAlign: "center" },
})

export async function renderReceiptPdf(data: ReceiptPdfData): Promise<Buffer> {
  const brand = data.garageBrandColor ?? "#0f172a"
  const doc = (
    <Document title={`Receipt ${data.receiptNumber ?? ""} — ${data.garageName}`} author="FixAm">
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          <Text style={[styles.garageName, { color: brand }]}>{data.garageName}</Text>
          {data.garageAddress ? <Text style={styles.garageMeta}>{data.garageAddress}</Text> : null}
          {data.garagePhone ? <Text style={styles.garageMeta}>{data.garagePhone}</Text> : null}
          {data.garageTin ? <Text style={styles.garageMeta}>TIN: {data.garageTin}</Text> : null}
          <Text style={[styles.title, { color: brand }]}>Payment received</Text>
          <Text style={styles.receiptNo}>{data.receiptNumber ?? "Receipt"}</Text>
        </View>

        <Text style={styles.amount}>{formatGHS(data.amount)}</Text>
        <Text style={styles.method}>via {METHOD_LABEL[data.method] ?? data.method}</Text>

        <View style={styles.rows}>
          {data.invoiceNumber ? (
            <View style={styles.row}><Text style={styles.label}>Invoice</Text><Text>{data.invoiceNumber}</Text></View>
          ) : null}
          {data.invoiceBalance != null && data.invoiceBalance > 0 ? (
            <View style={styles.row}><Text style={styles.label}>Balance due</Text><Text>{formatGHS(data.invoiceBalance)}</Text></View>
          ) : null}
          {data.paidAt ? (
            <View style={styles.row}>
              <Text style={styles.label}>Paid at</Text>
              <Text>{new Date(data.paidAt).toLocaleString("en-GH", { timeZone: "Africa/Accra" })}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.footer}>Powered by FixAm · Keep this receipt for your records</Text>
      </Page>
    </Document>
  )
  return renderToBuffer(doc)
}
