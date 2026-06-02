-- CreateTable
CREATE TABLE "ClockEntryEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clockEntryId" TEXT NOT NULL,
    "editedById" TEXT,
    "reason" TEXT NOT NULL,
    "prevClockIn" DATETIME NOT NULL,
    "prevClockOut" DATETIME,
    "newClockIn" DATETIME NOT NULL,
    "newClockOut" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClockEntryEdit_clockEntryId_fkey" FOREIGN KEY ("clockEntryId") REFERENCES "ClockEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClockEntryEdit_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
