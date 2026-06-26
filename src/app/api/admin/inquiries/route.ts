import { readSession } from "@/lib/session";
import { jsonError, jsonOk } from "@/lib/json";
import { requireAdminish } from "@/lib/admin-access";
import {
  countOpenInquiries,
  listInquiries,
  type InquirySubmitterRole,
  type InquiryStatus,
} from "@/lib/repositories/inquiry-repository";
import { getUserById } from "@/lib/repositories/user-repository";

function parseRole(value: string | null): InquirySubmitterRole | null {
  if (value === "CLIENT" || value === "PARTNER") return value;
  return null;
}

function parseStatus(value: string | null): InquiryStatus | null {
  if (value === "OPEN" || value === "ANSWERED") return value;
  return null;
}

export async function GET(request: Request) {
  const session = await readSession();
  const denied = requireAdminish(session);
  if (denied) return jsonError(denied.error, denied.status);

  const { searchParams } = new URL(request.url);
  const submitterRole = parseRole(searchParams.get("role"));
  const status = parseStatus(searchParams.get("status"));

  const inquiries = await listInquiries({ submitterRole, status, limit: 100 });
  const openCount = await countOpenInquiries();

  const enriched = await Promise.all(
    inquiries.map(async (inquiry) => {
      const user = await getUserById(inquiry.userId);
      const repliedBy = inquiry.repliedByUserId
        ? await getUserById(inquiry.repliedByUserId)
        : null;
      return {
        ...inquiry,
        submitterDisplayName: user?.displayName ?? inquiry.name,
        repliedByDisplayName: repliedBy?.displayName ?? null,
      };
    }),
  );

  return jsonOk({ inquiries: enriched, openCount });
}
