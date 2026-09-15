import type { MacroIcon } from '@kobralink/shared';
import {
    Droplets,
    Flame,
    Home,
    Lightbulb,
    type LucideIcon,
    Snowflake,
    Sparkles,
    Timer,
    Wind,
    Wrench,
    Zap,
} from 'lucide-react';

export const MACRO_ICON: Record<MacroIcon, LucideIcon> = {
    zap: Zap,
    flame: Flame,
    wind: Wind,
    lightbulb: Lightbulb,
    home: Home,
    droplets: Droplets,
    snowflake: Snowflake,
    timer: Timer,
    wrench: Wrench,
    sparkles: Sparkles,
};
