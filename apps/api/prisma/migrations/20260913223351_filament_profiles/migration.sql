-- CreateTable
CREATE TABLE "filament_profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "slot_profile" (
    "printerId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "vendor" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filamentId" TEXT NOT NULL DEFAULT '',

    PRIMARY KEY ("printerId", "slotIndex"),
    CONSTRAINT "slot_profile_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "filament_profile_vendor_name_key" ON "filament_profile"("vendor", "name");
