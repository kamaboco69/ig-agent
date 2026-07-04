import { prisma } from "@/lib/db";
import { getOrgContext, unauthorizedResponse } from "@/lib/auth-helpers";

// Google ドライブ連携の解除。
export async function POST() {
  const ctx = await getOrgContext();
  if (!ctx) return unauthorizedResponse();

  await prisma.driveIntegration.deleteMany({ where: { organizationId: ctx.organizationId } });
  return Response.json({ ok: true });
}
