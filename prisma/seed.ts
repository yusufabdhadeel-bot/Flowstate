import { PrismaClient, Role, MemoStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.memo.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const organizationA = await prisma.organization.create({
    data: {
      name: 'Organization A',
      slug: 'organization-a',
      domain: 'org-a.example.com',
      isActive: true,
    },
  });

  const organizationB = await prisma.organization.create({
    data: {
      name: 'Organization B',
      slug: 'organization-b',
      domain: 'org-b.example.com',
      isActive: true,
    },
  });

  const adminA = await prisma.user.create({
    data: {
      name: 'Admin User A',
      email: 'admin-a@example.com',
      passwordHash: 'hashed-admin-password',
      role: Role.ADMIN,
      organizationId: organizationA.id,
      isActive: true,
    },
  });

  const adminB = await prisma.user.create({
    data: {
      name: 'Admin User B',
      email: 'admin-b@example.com',
      passwordHash: 'hashed-admin-password',
      role: Role.ADMIN,
      organizationId: organizationB.id,
      isActive: true,
    },
  });

  const managerOne = await prisma.user.create({
    data: {
      name: 'Manager One',
      email: 'manager1@example.com',
      passwordHash: 'hashed-manager1-password',
      role: Role.MANAGER,
      organizationId: organizationA.id,
      reportsTo: adminA.id,
      isActive: true,
    },
  });

  const managerTwo = await prisma.user.create({
    data: {
      name: 'Manager Two',
      email: 'manager2@example.com',
      passwordHash: 'hashed-manager2-password',
      role: Role.MANAGER,
      organizationId: organizationB.id,
      reportsTo: adminB.id,
      isActive: true,
    },
  });

  const staffOne = await prisma.user.create({
    data: {
      name: 'Staff One',
      email: 'staff1@example.com',
      passwordHash: 'hashed-staff1-password',
      role: Role.STAFF,
      organizationId: organizationA.id,
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
      organizationId: organizationB.id,
      reportsTo: managerTwo.id,
      isActive: true,
    },
  });

  const memo1 = await prisma.memo.create({
    data: {
      title: 'Budget Request for Q2',
      content: 'Requesting additional budget for marketing campaigns in Q2. Details attached.',
      attachmentUrl: 'https://example.com/budget-q2.pdf',
      status: MemoStatus.PENDING,
      createdBy: staffOne.id,
      organizationId: organizationA.id,
      currentApproverId: managerOne.id,
    },
  });

  const memo2 = await prisma.memo.create({
    data: {
      title: 'Equipment Upgrade Proposal',
      content: 'Proposal to upgrade office equipment for better productivity.',
      status: MemoStatus.PENDING,
      createdBy: staffTwo.id,
      organizationId: organizationB.id,
      currentApproverId: managerTwo.id,
    },
  });

  await prisma.comment.create({
    data: {
      memoId: memo1.id,
      userId: managerOne.id,
      organizationId: organizationA.id,
      message: 'Please provide more details on the expected ROI.',
    },
  });

  await prisma.comment.create({
    data: {
      memoId: memo2.id,
      userId: staffTwo.id,
      organizationId: organizationB.id,
      message: 'I have attached the supporting notes.',
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: organizationA.id,
        action: 'CREATE_MEMO',
        entityType: 'Memo',
        entityId: memo1.id,
        details: 'Seeded memo for Organization A',
      },
      {
        organizationId: organizationB.id,
        action: 'CREATE_MEMO',
        entityType: 'Memo',
        entityId: memo2.id,
        details: 'Seeded memo for Organization B',
      },
    ],
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
