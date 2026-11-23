import "server-only"
import QRCode from "qrcode"

/** QR code for a URL as an inline SVG string (dark modules on white). */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1220", light: "#ffffff" } })
}
