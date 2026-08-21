import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [, , email, eventId] = process.argv;
  if (!email || !eventId) {
    throw new Error('Usage: tsx add-event-member.ts <email> <eventId>');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  await prisma.eventMember.createMany({
    data: [{ eventId, userId: user.id }],
    skipDuplicates: true,
  });

  console.log(`Added ${email} as event member of ${eventId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
