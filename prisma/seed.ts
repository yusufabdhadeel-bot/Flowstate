import { PrismaClient, Role, MemoStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash: 'hashed-admin-password',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const managerOne = await prisma.user.create({
    data: {
      name: 'Manager One',
      email: 'manager1@example.com',
      passwordHash: 'hashed-manager1-password',
      role: Role.MANAGER,
      reportsTo: admin.id,
      isActive: true,
    },
  });

  const managerTwo = await prisma.user.create({
    data: {
      name: 'Manager Two',
      email: 'manager2@example.com',
      passwordHash: 'hashed-manager2-password',
      role: Role.MANAGER,
      reportsTo: admin.id,
      isActive: true,
    },
  });

  const staffOne = await prisma.user.create({
    data: {
      name: 'Staff One',
      email: 'staff1@example.com',
      passwordHash: 'hashed-staff1-password',
      role: Role.STAFF,
      reportsTo: managerOne.id,
      isActive: true,
    },
  });

  const staffTwo = await prisma.user.create({
    data: {
      name: 'Staff Two',
      email: 'staff2@example.com',
      passwordHash: 'hashed-staff2-password',
      role: Role.STAFF,
      reportsTo: managerOne.id,
      isActive: true,
    },
  });

  const staffThree = await prisma.user.create({
    data: {
      name: 'Staff Three',
      email: 'staff3@example.com',
      passwordHash: 'hashed-staff3-password',
      role: Role.STAFF,
      reportsTo: managerTwo.id,
      isActive: true,
    },
  });

  // Create sample memos
  const memo1 = await prisma.memo.create({
    data: {
      title: 'Budget Request for Q2',
      content: 'Requesting additional budget for marketing campaigns in Q2. Details attached.',
      attachmentUrl: 'https://example.com/budget-q2.pdf',
      status: MemoStatus.PENDING,
      createdBy: staffOne.id,
      currentApproverId: managerOne.id,
    },
  });

  const memo2 = await prisma.memo.create({
    data: {
      title: 'Equipment Upgrade Proposal',
      content: 'Proposal to upgrade office equipment for better productivity.',
      status: MemoStatus.PENDING,
      createdBy: staffTwo.id,
      currentApproverId: managerOne.id,
    },
  });

  // Add comments to memo1
  await prisma.comment.create({
    data: {
      memoId: memo1.id,
      userId: managerOne.id,
      message: 'Please provide more details on the expected ROI.',
    },
  });

  await prisma.comment.create({
    data: {
      memoId: memo1.id,
      userId: staffOne.id,
      message: 'ROI details attached in the updated document.',
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
