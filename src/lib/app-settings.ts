import { getAppSettingsRow } from "@/lib/repositories/app-settings-repository";

export async function getAppSettings() {
  return getAppSettingsRow();
}
