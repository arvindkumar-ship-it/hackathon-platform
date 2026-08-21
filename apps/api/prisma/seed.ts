import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.local' },
    update: {},
    create: {
      name: 'Development Admin',
      email: 'admin@example.local',
      passwordHash: '$argon2id$v=19$m=65536,p=4,t=3$CI7AgJoqLB82NIovy/4pEQ$oAhJTZ8hCVF+qGFyKWUkE5s70+O41Vq0bXj92ioLs3o',
      role: Role.ADMIN,
    },
  });

  const judge = await prisma.user.upsert({
    where: { email: 'judge@example.local' },
    update: {},
    create: {
      name: 'Development Judge',
      email: 'judge@example.local',
      passwordHash: '$argon2id$v=19$m=65536,p=4,t=3$CI7AgJoqLB82NIovy/4pEQ$oAhJTZ8hCVF+qGFyKWUkE5s70+O41Vq0bXj92ioLs3o',
      role: Role.JUDGE,
    },
  });

  const participant = await prisma.user.upsert({
    where: { email: 'participant@example.local' },
    update: {},
    create: {
      name: 'Development Participant',
      email: 'participant@example.local',
      passwordHash: '$argon2id$v=19$m=65536,p=4,t=3$CI7AgJoqLB82NIovy/4pEQ$oAhJTZ8hCVF+qGFyKWUkE5s70+O41Vq0bXj92ioLs3o',
      role: Role.PARTICIPANT,
    },
  });

  const event = await prisma.event.upsert({
    where: { slug: 'designarena-development' },
    update: {},
    create: {
      name: 'DesignArena Development Event',
      slug: 'designarena-development',
      description: 'Development-only event seed.',
      status: 'DRAFT',
      maxTeamSize: 4,
    },
  });

  await prisma.eventMember.upsert({
    where: { eventId_userId: { eventId: event.id, userId: admin.id } },
    update: {},
    create: { eventId: event.id, userId: admin.id },
  });

  await prisma.eventMember.upsert({
    where: { eventId_userId: { eventId: event.id, userId: judge.id } },
    update: {},
    create: { eventId: event.id, userId: judge.id },
  });

  await prisma.eventMember.upsert({
    where: { eventId_userId: { eventId: event.id, userId: participant.id } },
    update: {},
    create: { eventId: event.id, userId: participant.id },
  });

  const criteria = [
    { name: 'Visual Design', description: 'Visual hierarchy, consistency and presentation quality.', weight: 25, displayOrder: 1 },
    { name: 'UX and Usability', description: 'Ease of use, navigation and user experience.', weight: 25, displayOrder: 2 },
    { name: 'Creativity', description: 'Originality and creative problem solving.', weight: 20, displayOrder: 3 },
    { name: 'Problem Understanding', description: 'Understanding of the problem and target audience.', weight: 15, displayOrder: 4 },
    { name: 'Feasibility', description: 'Practicality and technical feasibility.', weight: 15, displayOrder: 5 },
  ];

  await prisma.judgingCriterion.deleteMany({ where: { eventId: event.id } });

  await prisma.judgingCriterion.createMany({
    data: criteria.map((criterion) => ({ eventId: event.id, ...criterion })),
  });

  console.log({
    eventId: event.id,
    adminId: admin.id,
    judgeId: judge.id,
    participantId: participant.id,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });