// E2E検証用: テストユーザー＋組織＋ダミーIGアカウントを作成（冪等）
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { encryptSecret } from "../src/lib/crypto";

async function main() {
  const email = "e2e@example.com";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: "E2E", passwordHash: await bcrypt.hash("e2e-pass-1234", 10) },
    });
    const org = await prisma.organization.create({ data: { name: "E2Eワークスペース", ownerId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: org.id } });
    user = (await prisma.user.findUnique({ where: { email } }))!;
  }
  const orgId = user.organizationId!;
  const existing = await prisma.igAccount.findFirst({ where: { organizationId: orgId } });
  if (!existing) {
    await prisma.igAccount.create({
      data: {
        organizationId: orgId,
        igUserId: "99999001",
        username: "e2e_dummy_ig",
        accessToken: encryptSecret("dummy-token-not-real"),
        tokenExpiresAt: new Date(Date.now() + 50 * 24 * 3600 * 1000),
        status: "connected",
      },
    });
  }
  console.log("seeded:", email, "org:", orgId);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
