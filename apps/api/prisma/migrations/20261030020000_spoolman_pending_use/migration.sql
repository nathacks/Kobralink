-- CreateTable
CREATE TABLE "spoolman_pending_use" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spoolId" INTEGER NOT NULL,
    "lengthMm" REAL NOT NULL,
    "printerId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
