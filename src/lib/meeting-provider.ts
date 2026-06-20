import { getEffectiveAppSettingsForMatch } from "@/lib/effective-app-settings";
import { getPartnerZoomProfile, type PartnerZoomProfileRow } from "@/lib/repositories/zoom-repository";
import {
  type MeetingProvider,
  formatMeetingLines,
  isPartnerMeetingProfileComplete,
  meetingProviderLabel,
  normalizeMeetingProvider,
  MEETING_PROVIDER_OPTIONS,
  type PartnerMeetingProfileLike,
  validatePartnerMeetingInput,
} from "@/lib/meeting-provider-shared";

export {
  MEETING_PROVIDER_OPTIONS,
  normalizeMeetingProvider,
  meetingProviderLabel,
  formatMeetingLines,
  isPartnerMeetingProfileComplete,
  validatePartnerMeetingInput,
  type MeetingProvider,
  type PartnerMeetingProfileLike,
};

export type MeetingSnapshot = {
  provider: MeetingProvider;
  joinUrl: string;
  zoomMeetingId: string | null;
  zoomPass: string | null;
};

/** 企業設定とパートナー登録情報から、日程確定時にスナップショットする会議情報を決定する。 */
export async function resolveMeetingSnapshotForMatch(
  matchId: string,
  partnerId: string,
): Promise<MeetingSnapshot | null> {
  const [effective, profile] = await Promise.all([
    getEffectiveAppSettingsForMatch(matchId),
    getPartnerZoomProfile(partnerId),
  ]);
  return resolveMeetingSnapshotFromProfile(effective.meetingProvider, profile);
}

export function resolveMeetingSnapshotFromProfile(
  provider: MeetingProvider,
  profile: PartnerZoomProfileRow | null,
): MeetingSnapshot | null {
  if (!profile) return null;
  if (provider === "google_meet") {
    const url = profile.googleMeetUrl?.trim() ?? "";
    if (!url) return null;
    return { provider: "google_meet", joinUrl: url, zoomMeetingId: null, zoomPass: null };
  }
  const url = profile.zoomUrl?.trim() ?? "";
  if (!url) return null;
  return {
    provider: "zoom",
    joinUrl: url,
    zoomMeetingId: profile.zoomMeetingId,
    zoomPass: profile.zoomPass,
  };
}
