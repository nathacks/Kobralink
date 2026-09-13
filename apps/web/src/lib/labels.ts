import type { FilamentMode } from '@kobralink/shared';

export const FILAMENT_MODE_LABEL: Record<FilamentMode, string> = {
    toolhead: 'Tête (buffer)',
    ace_direct: 'ACE direct',
    ace_hub: 'Tête + ACE (hub)',
};

export const AMS_ACTIVITY_LABEL: Record<string, string> = {
    feeding: 'Chargement…',
    retracting: 'Retrait…',
    loaded: 'Chargé',
};

export const JOB_STATUS_LABEL: Record<string, string> = {
    printing: 'En cours',
    completed: 'Terminé',
    cancelled: 'Annulé',
    error: 'Erreur',
};

export const KOBRA_STATE_LABEL: Record<string, string> = {
    free: 'Prête',
    busy: 'Occupée',
    printing: 'Impression',
    preheating: 'Préchauffage',
    auto_leveling: 'Nivellement',
    checking: 'Vérification',
    updated: 'Mise à jour',
    init: 'Initialisation',
    pausing: 'Mise en pause',
    paused: 'En pause',
    pause: 'En pause',
    resuming: 'Reprise',
    resumed: 'Reprise',
    stopping: 'Arrêt',
    stoped: 'Arrêtée',
    finished: 'Terminée',
    failed: 'Erreur',
    canceled: 'Annulée',
    offline: 'Hors ligne',
};
