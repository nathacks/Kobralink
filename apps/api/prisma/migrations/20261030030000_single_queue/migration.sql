-- AlterTable
ALTER TABLE "gcode_file" ADD COLUMN "printerModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "gcode_file" ADD COLUMN "nozzleMm" REAL;
ALTER TABLE "gcode_file" ADD COLUMN "bedX" REAL;
ALTER TABLE "gcode_file" ADD COLUMN "bedY" REAL;
ALTER TABLE "gcode_file" ADD COLUMN "extentX" REAL;
ALTER TABLE "gcode_file" ADD COLUMN "extentY" REAL;
ALTER TABLE "gcode_file" ADD COLUMN "maxZ" REAL;
ALTER TABLE "gcode_file" ADD COLUMN "metaVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "printer" ADD COLUMN "awaitingBedClear" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "printer" ADD COLUMN "maintenance" BOOLEAN NOT NULL DEFAULT false;

-- RedefineTables: one queue for every printer, ordered globally
CREATE TABLE "new_queue_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printerId" TEXT,
    "targetTags" TEXT NOT NULL DEFAULT '[]',
    "fileId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "excludedObjects" TEXT NOT NULL DEFAULT '[]',
    "options" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "queue_item_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "queue_item_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "gcode_file" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_queue_item" ("id", "printerId", "fileId", "position", "excludedObjects", "options", "createdAt")
SELECT "id", "printerId", "fileId",
       ROW_NUMBER() OVER (ORDER BY "position", "createdAt"),
       "excludedObjects", "options", "createdAt"
FROM "queue_item";
DROP TABLE "queue_item";
ALTER TABLE "new_queue_item" RENAME TO "queue_item";
CREATE INDEX "queue_item_position_idx" ON "queue_item"("position");
