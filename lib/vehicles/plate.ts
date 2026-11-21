/** Ghana plate → canonical search key: uppercase, alphanumerics only. */
export function plateSearchKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "")
}
