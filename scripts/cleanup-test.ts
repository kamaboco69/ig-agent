// E2E検証用データ（e2e@example.com のユーザー・組織・ダミーIGアカウント・ストーリーズ）を削除
import { prisma } from "../src/lib/db";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "e2e@example.com" } });
  if (!user) {
    console.log("e2e user not found (already clean)");
    return;
  }
  if (user.organizationId) {
    // organization を消せば IgAccount / Story は cascade で消える
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: null } });
    await prisma.organization.delete({ where: { id: user.organizationId } });
  }
  await prisma.user.delete({ where: { id: user.id } });
  console.log("deleted e2e user/org and related data");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
