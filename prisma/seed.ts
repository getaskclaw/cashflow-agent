import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create demo user
  const user = await prisma.user.upsert({
    where: { email: "demo@cashflowagent.dev" },
    update: {},
    create: {
      name: "Alex (Roofing Pro)",
      email: "demo@cashflowagent.dev",
    },
  });

  // Create customers
  const john = await prisma.customer.create({
    data: {
      userId: user.id,
      name: "John Martinez",
      email: "john@example.com",
      phone: "(555) 123-4567",
      notes: "Regular client. Roof repairs and gutter cleaning. Pays slow but always comes through eventually.",
    },
  });

  const acme = await prisma.customer.create({
    data: {
      userId: user.id,
      name: "ACME Corp Facilities",
      email: "billing@acmecorp.com",
      phone: "(555) 987-6543",
      notes: "Commercial client. Net-30 terms. Multiple properties. Contact: Sarah (facilities manager).",
    },
  });

  const sarah = await prisma.customer.create({
    data: {
      userId: user.id,
      name: "Sarah Chen",
      email: "sarah@example.com",
      notes: "Small jobs. Pays promptly. Referred two neighbors already.",
    },
  });

  // Invoice 1: John - 12 days overdue, had a broken promise
  const inv1042 = await prisma.invoice.create({
    data: {
      userId: user.id,
      customerId: john.id,
      invoiceNumber: "INV-1042",
      amount: 320000, // $3,200
      description: "Roof repair - 120 sqm tile replacement + gutter cleaning",
      dueDate: new Date("2026-06-10"),
      createdAt: new Date("2026-05-20"),
      status: "overdue",
    },
  });

  // Communication history for invoice 1042
  const comm1 = await prisma.communication.create({
    data: {
      invoiceId: inv1042.id,
      direction: "outbound",
      content: `Hi John,

Thanks for choosing us for your roof repair. Please find the invoice attached.

Invoice #INV-1042
Amount: $3,200.00
Due: June 10, 2026

Payment link: https://pay.stripe.com/...

Best,
Alex
Roofing Pro`,
      sentAt: new Date("2026-05-20"),
    },
  });

  const comm2 = await prisma.communication.create({
    data: {
      invoiceId: inv1042.id,
      direction: "outbound",
      content: `Hi John,

Just a friendly reminder that invoice INV-1042 ($3,200.00) is due in 3 days.

Payment link: https://pay.stripe.com/...

Thanks,
Alex`,
      sentAt: new Date("2026-06-07"),
    },
  });

  const comm3 = await prisma.communication.create({
    data: {
      invoiceId: inv1042.id,
      direction: "inbound",
      content: `Hey Alex,

Sorry for the delay — been swamped with work. I'll pay next week for sure. The roof's holding up great, thanks for the quality job.

John`,
      createdAt: new Date("2026-06-12"),
    },
  });

  const comm4 = await prisma.communication.create({
    data: {
      invoiceId: inv1042.id,
      direction: "outbound",
      content: `No worries John, glad the roof's good! I'll check in next week.

Thanks,
Alex`,
      sentAt: new Date("2026-06-12"),
    },
  });

  // Invoice 2: ACME Corp - due in 3 days
  const inv1043 = await prisma.invoice.create({
    data: {
      userId: user.id,
      customerId: acme.id,
      invoiceNumber: "INV-1043",
      amount: 240000, // $2,400
      description: "Commercial gutter installation - Building B, 8 units",
      dueDate: new Date("2026-06-25"),
      createdAt: new Date("2026-06-01"),
      status: "pending",
    },
  });

  // Invoice 3: Sarah - already paid
  const inv1044 = await prisma.invoice.create({
    data: {
      userId: user.id,
      customerId: sarah.id,
      invoiceNumber: "INV-1044",
      amount: 115000, // $1,150
      description: "Front porch railing replacement + paint",
      dueDate: new Date("2026-06-05"),
      createdAt: new Date("2026-05-25"),
      status: "paid",
      paidAt: new Date("2026-06-03"),
    },
  });

  // Invoice 4: John - new quote request (pending - needs agent to draft)
  const inv1045 = await prisma.invoice.create({
    data: {
      userId: user.id,
      customerId: john.id,
      invoiceNumber: "INV-1045",
      amount: 80000, // $800 deposit
      description: "New quote: Flat roof inspection + resealing (pending)",
      dueDate: new Date("2026-07-01"),
      createdAt: new Date("2026-06-20"),
      status: "pending",
    },
  });

  console.log("Seed complete!");
  console.log(`  User: ${user.email}`);
  console.log(`  Customers: ${[john.name, acme.name, sarah.name].join(", ")}`);
  console.log(`  Invoices:`);
  console.log(`    ${inv1042.invoiceNumber} - ${john.name} - $${(inv1042.amount/100).toFixed(2)} - ${inv1042.status}`);
  console.log(`    ${inv1043.invoiceNumber} - ${acme.name} - $${(inv1043.amount/100).toFixed(2)} - ${inv1043.status}`);
  console.log(`    ${inv1044.invoiceNumber} - ${sarah.name} - $${(inv1044.amount/100).toFixed(2)} - ${inv1044.status}`);
  console.log(`    ${inv1045.invoiceNumber} - ${john.name} - $${(inv1045.amount/100).toFixed(2)} - ${inv1045.status}`);
  console.log(`  Communications: ${4} entries`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
