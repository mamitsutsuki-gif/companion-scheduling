export type MeetingProvider = "zoom" | "google_meet";

export const MEETING_PROVIDER_OPTIONS: Array<{ value: MeetingProvider; label: string }> = [
  { value: "zoom", label: "Zoom" },
  { value: "google_meet", label: "Google Meet" },
];

export function normalizeMeetingProvider(input: unknown): MeetingProvider {
  return input === "google_meet" ? "google_meet" : "zoom";
}

export function meetingProviderLabel(provider: MeetingProvider): string {
  return provider === "google_meet" ? "Google Meet" : "Zoom";
}

export type PartnerMeetingProfileLike = {
  zoomUrl: string;
  zoomMeetingId: string | null;
  zoomPass: string | null;
  googleMeetUrl: string | null;
};

export function isPartnerMeetingProfileComplete(
  profile: PartnerMeetingProfileLike | null,
): boolean {
  if (!profile) return false;
  const zoomOk =
    profile.zoomUrl.trim().length > 0 &&
    (profile.zoomMeetingId?.trim().length ?? 0) > 0 &&
    (profile.zoomPass?.trim().length ?? 0) > 0;
  const meetOk = (profile.googleMeetUrl?.trim().length ?? 0) > 0;
  return zoomOk && meetOk;
}

export function validatePartnerMeetingInput(input: {
  zoomUrl: string;
  zoomMeetingId: string;
  zoomPass: string;
  googleMeetUrl: string;
}): string | null {
  try {
    // eslint-disable-next-line no-new
    new URL(input.zoomUrl.trim());
  } catch {
    return "Zoom の会議URLを https:// から始まる正しい形式で入力してください。";
  }
  if (!input.zoomMeetingId.trim()) return "Zoom のミーティング ID を入力してください。";
  if (!input.zoomPass.trim()) return "Zoom のパスコードを入力してください。";
  try {
    // eslint-disable-next-line no-new
    new URL(input.googleMeetUrl.trim());
  } catch {
    return "Google Meet の会議URLを https:// から始まる正しい形式で入力してください。";
  }
  return null;
}

export type MeetingSnapshotLike = {
  provider: MeetingProvider;
  joinUrl: string;
  zoomMeetingId: string | null;
  zoomPass: string | null;
};

/** 確定通知・ICS 用のテキスト行 */
export function formatMeetingLines(snapshot: MeetingSnapshotLike | null): string[] {
  if (!snapshot) return [];
  if (snapshot.provider === "google_meet") {
    return [`Google Meet URL: ${snapshot.joinUrl}`];
  }
  const lines = [`Zoom URL: ${snapshot.joinUrl}`];
  if (snapshot.zoomMeetingId) lines.push(`ミーティング ID: ${snapshot.zoomMeetingId}`);
  if (snapshot.zoomPass) lines.push(`パスコード: ${snapshot.zoomPass}`);
  return lines;
}
