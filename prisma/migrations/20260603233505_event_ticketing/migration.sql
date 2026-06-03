-- CreateTable
CREATE TABLE "EventTicketTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "depositCents" INTEGER,
    "capacity" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTicketTier_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "checkedInAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "tierName" TEXT NOT NULL,
    CONSTRAINT "EventOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EventOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventOrderItem_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "EventTicketTier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "guestCount" INTEGER,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "venue" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INQUIRY',
    "notes" TEXT,
    "menuNotes" TEXT,
    "depositAmount" DECIMAL,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "totalAmount" DECIMAL,
    "customerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ticketingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ticketMode" TEXT NOT NULL DEFAULT 'TICKET',
    CONSTRAINT "Event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("contactEmail", "contactName", "contactPhone", "createdAt", "customerId", "date", "depositAmount", "depositPaid", "endTime", "guestCount", "id", "menuNotes", "name", "notes", "startTime", "status", "totalAmount", "updatedAt", "venue") SELECT "contactEmail", "contactName", "contactPhone", "createdAt", "customerId", "date", "depositAmount", "depositPaid", "endTime", "guestCount", "id", "menuNotes", "name", "notes", "startTime", "status", "totalAmount", "updatedAt", "venue" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EventTicketTier_eventId_idx" ON "EventTicketTier"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventOrder_confirmationCode_key" ON "EventOrder"("confirmationCode");

-- CreateIndex
CREATE UNIQUE INDEX "EventOrder_stripeSessionId_key" ON "EventOrder"("stripeSessionId");

-- CreateIndex
CREATE INDEX "EventOrder_eventId_idx" ON "EventOrder"("eventId");

-- CreateIndex
CREATE INDEX "EventOrder_status_idx" ON "EventOrder"("status");

-- CreateIndex
CREATE INDEX "EventOrderItem_orderId_idx" ON "EventOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "EventOrderItem_tierId_idx" ON "EventOrderItem"("tierId");
