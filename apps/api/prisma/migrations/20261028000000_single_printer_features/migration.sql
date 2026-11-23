-- AlterTable
ALTER TABLE "print_job" ADD COLUMN "errorCode" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "print_job" ADD COLUMN "errorMsg" TEXT NOT NULL DEFAULT '';
ALTER TABLE "print_job" ADD COLUMN "failureReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "print_job" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "print_job" ADD COLUMN "snapshot" TEXT;

-- CreateTable
CREATE TABLE "scheduled_print" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printerId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "options" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_print_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scheduled_print_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "gcode_file" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "scheduled_print_printerId_startAt_idx" ON "scheduled_print"("printerId", "startAt");

-- CreateTable
CREATE TABLE "maintenance_task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "intervalHours" REAL NOT NULL DEFAULT 0,
    "intervalJobs" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "lastDoneAt" DATETIME,
    "dueNotifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "maintenance_task_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "maintenance_task_printerId_idx" ON "maintenance_task"("printerId");

-- CreateTable
CREATE TABLE "maintenance_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "doneAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL DEFAULT '',
    "hours" REAL NOT NULL DEFAULT 0,
    "jobs" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "maintenance_log_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "maintenance_task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "maintenance_log_taskId_doneAt_idx" ON "maintenance_log"("taskId", "doneAt");
