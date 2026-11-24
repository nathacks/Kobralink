UPDATE "apikey"
SET "metadata" = json_object(
    'printerId', NULLIF(
        CASE
            WHEN "metadata" IS NULL OR NOT json_valid("metadata") THEN NULL
            WHEN json_type("metadata") = 'text' THEN
                CASE WHEN json_valid(json_extract("metadata", '$'))
                    THEN json_extract(json_extract("metadata", '$'), '$.printerId') END
            ELSE json_extract("metadata", '$.printerId')
        END, ''),
    'uses', json_array('moonraker'))
WHERE "configId" = 'default';

UPDATE "apikey"
SET "configId" = 'default',
    "metadata" = json_object(
        'printerId', NULL,
        'uses', json_array(
            CASE
                WHEN "metadata" IS NULL OR NOT json_valid("metadata") THEN 'mcp_read'
                WHEN json_type("metadata") = 'text' THEN
                    CASE WHEN json_valid(json_extract("metadata", '$'))
                        AND json_extract(json_extract("metadata", '$'), '$.access') = 'control'
                        THEN 'mcp_control' ELSE 'mcp_read' END
                WHEN json_extract("metadata", '$.access') = 'control' THEN 'mcp_control'
                ELSE 'mcp_read'
            END))
WHERE "configId" = 'mcp';
