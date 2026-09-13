-- AlterTable
ALTER TABLE "gcode_file" ADD COLUMN "objects" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "gcode_file" ADD COLUMN "svgImage" TEXT;
