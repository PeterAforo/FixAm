export type CompatEntry = { make?: string; model?: string; year_from?: number; year_to?: number }
export type VehicleRef = { make: string; model: string; year: number | null }

/** compatible_vehicles jsonb: [{make,model,year_from,year_to}]; empty = fits all. */
export function isCompatible(compats: unknown, vehicle: VehicleRef | null): boolean {
  if (!vehicle) return true
  if (!Array.isArray(compats) || compats.length === 0) return true
  const vMake = vehicle.make.toLowerCase()
  const vModel = vehicle.model.toLowerCase()
  return (compats as CompatEntry[]).some((c) => {
    const makeOk = !c.make ||
      c.make.toLowerCase() === vMake ||
      vMake.includes(c.make.toLowerCase()) ||
      c.make.toLowerCase().includes(vMake)
    const modelOk = !c.model || c.model === "*" ||
      c.model.toLowerCase() === vModel || vModel.includes(c.model.toLowerCase())
    const yearOk =
      (!c.year_from || (vehicle.year ?? 0) >= c.year_from) &&
      (!c.year_to || (vehicle.year ?? 9999) <= c.year_to)
    return makeOk && modelOk && yearOk
  })
}
