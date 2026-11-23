-- AlterTable
ALTER TABLE "maintenance_task" ADD COLUMN "presetKey" TEXT NOT NULL DEFAULT '';

-- Recognise tasks created from a recommendation before the key was stored
UPDATE "maintenance_task" SET "presetKey" = 'lubricate_axes' WHERE "presetKey" = '' AND trim("name") IN ('Lubrifier les axes', 'Lubricate the axes', 'Achsen schmieren', 'Lubricar los ejes', 'Lubrificare gli assi', '润滑导轨', 'Lubrificar os eixos');
UPDATE "maintenance_task" SET "presetKey" = 'clean_nozzle' WHERE "presetKey" = '' AND trim("name") IN ('Nettoyer la buse', 'Clean the nozzle', 'Düse reinigen', 'Limpiar la boquilla', 'Pulire l’ugello', '清洁喷嘴', 'Limpar o bico');
UPDATE "maintenance_task" SET "presetKey" = 'check_belts' WHERE "presetKey" = '' AND trim("name") IN ('Vérifier la tension des courroies', 'Check belt tension', 'Riemenspannung prüfen', 'Revisar la tensión de las correas', 'Controllare la tensione delle cinghie', '检查皮带张紧', 'Verificar a tensão das correias');
UPDATE "maintenance_task" SET "presetKey" = 'clean_bed' WHERE "presetKey" = '' AND trim("name") IN ('Nettoyer le plateau', 'Clean the bed', 'Druckbett reinigen', 'Limpiar la cama', 'Pulire il piano', '清洁热床', 'Limpar a mesa');
UPDATE "maintenance_task" SET "presetKey" = 'clean_fans' WHERE "presetKey" = '' AND trim("name") IN ('Nettoyer les ventilateurs', 'Clean the fans', 'Lüfter reinigen', 'Limpiar los ventiladores', 'Pulire le ventole', '清洁风扇', 'Limpar as ventoinhas');
