-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "spool_assignment" (
    "printerId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "spoolId" INTEGER NOT NULL,

    PRIMARY KEY ("printerId", "slotIndex"),
    CONSTRAINT "spool_assignment_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
