-- Add zoomMeetingId to PartnerZoomProfile and Negotiation snapshot (local sqlite only; prod uses Firestore).

ALTER TABLE "PartnerZoomProfile" ADD COLUMN "zoomMeetingId" TEXT;
ALTER TABLE "Negotiation" ADD COLUMN "confirmedZoomMeetingId" TEXT;
