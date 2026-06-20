import { getPartnerZoomProfile } from "@/lib/repositories/zoom-repository";
import { isPartnerMeetingProfileComplete } from "@/lib/meeting-provider-shared";

export function isClientRegistrationComplete(user: {
  role: string;
  availabilitySlotIds?: string[] | null;
}): boolean {
  if (user.role !== "CLIENT") return true;
  const ids = user.availabilitySlotIds ?? [];
  return ids.length > 0;
}

export async function isPartnerRegistrationComplete(partnerId: string): Promise<boolean> {
  const profile = await getPartnerZoomProfile(partnerId);
  return isPartnerMeetingProfileComplete(profile);
}

export async function needsRegistrationProfileCompletion(user: {
  id: string;
  role: string;
  availabilitySlotIds?: string[] | null;
}): Promise<boolean> {
  if (user.role === "PARTNER") return !(await isPartnerRegistrationComplete(user.id));
  if (user.role === "CLIENT") return !isClientRegistrationComplete(user);
  return false;
}
