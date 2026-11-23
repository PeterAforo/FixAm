"use server"

import {
  bookAndPayInspection,
  cancelMyInspection,
  completeInspection,
  linkInspectionToVehicle,
  listGarageInspections,
  listInspectionGarages,
  myInspections,
  myVehiclesForLinking,
  saveInspectionItem,
  saveInspectionSettings,
  startInspection,
} from "./service"

export async function listInspectionGaragesAction() {
  return listInspectionGarages()
}
export async function myInspectionsAction() {
  return myInspections()
}
export async function bookAndPayInspectionAction(input: Parameters<typeof bookAndPayInspection>[0], channel: "card" | "momo", momoNetwork?: "mtn" | "telecel" | "airteltigo") {
  return bookAndPayInspection(input, channel, momoNetwork)
}
export async function cancelMyInspectionAction(id: string) {
  return cancelMyInspection(id)
}
export async function listGarageInspectionsAction(garageId: string, status?: string) {
  return listGarageInspections(garageId, status)
}
export async function startInspectionAction(input: { garageId: string; inspectionId: string }) {
  return startInspection(input)
}
export async function saveInspectionItemAction(input: Parameters<typeof saveInspectionItem>[0]) {
  return saveInspectionItem(input)
}
export async function completeInspectionAction(input: Parameters<typeof completeInspection>[0]) {
  return completeInspection(input)
}
export async function saveInspectionSettingsAction(input: Parameters<typeof saveInspectionSettings>[0]) {
  return saveInspectionSettings(input)
}
export async function linkInspectionToVehicleAction(input: { inspectionId: string; vehicleId: string }) {
  return linkInspectionToVehicle(input)
}
export async function myVehiclesForLinkingAction() {
  return myVehiclesForLinking()
}
export async function myInspectionReportAction(inspectionId: string) {
  const { myInspectionReport } = await import("./service")
  return myInspectionReport(inspectionId)
}
export async function uploadInspectionPhotoAction(form: FormData) {
  const { storeInspectionPhoto } = await import("./service")
  return storeInspectionPhoto(form)
}
