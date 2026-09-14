-- AlterTable
ALTER TABLE "user" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'admin';

-- AlterTable
ALTER TABLE "print_job" ADD COLUMN "filamentMm" REAL NOT NULL DEFAULT 0;
ALTER TABLE "print_job" ADD COLUMN "spoolUsage" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "timelapse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printerId" TEXT NOT NULL,
    "jobId" TEXT,
    "filename" TEXT NOT NULL,
    "frames" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "durationSec" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "timelapse_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "timelapse_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "print_job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "timelapse_printerId_createdAt_idx" ON "timelapse"("printerId", "createdAt");

-- CreateTable
CREATE TABLE "queue_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printerId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "excludedObjects" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "queue_item_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "queue_item_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "gcode_file" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "queue_item_printerId_position_idx" ON "queue_item"("printerId", "position");

-- CreateTable
CREATE TABLE "local_spool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "material" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL DEFAULT '#808080',
    "diameterMm" REAL NOT NULL DEFAULT 1.75,
    "densityGcm3" REAL NOT NULL DEFAULT 1.24,
    "initialWeightG" REAL NOT NULL DEFAULT 1000,
    "usedMm" REAL NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

-- CreateTable
CREATE TABLE "local_spool_assignment" (
    "printerId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "spoolId" TEXT NOT NULL,

    PRIMARY KEY ("printerId", "slotIndex"),
    CONSTRAINT "local_spool_assignment_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "local_spool_assignment_spoolId_fkey" FOREIGN KEY ("spoolId") REFERENCES "local_spool" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "macro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'zap',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "macro_name_key" ON "macro"("name");

-- CreateTable
CREATE TABLE "scheduled_dry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printerId" TEXT NOT NULL,
    "aceId" INTEGER,
    "startAt" DATETIME NOT NULL,
    "targetTemp" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_dry_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "scheduled_dry_printerId_startAt_idx" ON "scheduled_dry"("printerId", "startAt");
