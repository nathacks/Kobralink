import { THEME_OPTIONS } from '@/components/layout/user-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useThemePreference } from '@/hooks/use-theme';
import { LOCALE_LABEL, type Locale, locales, m, setLocale, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { themeStore } from '@/stores/theme';
import { SettingsCard, SwitchRow } from './settings-form-card';

export function AppearanceCard() {
    const theme = useThemePreference();
    const locale = useLocale();
    return (
        <SettingsCard title={m.theme_title()} description={m.theme_hint()}>
            <SwitchRow label={m.theme_label()} hint={m.theme_label_hint()}>
                <div className="flex gap-1 rounded-full bg-secondary p-1">
                    {THEME_OPTIONS.map((o) => (
                        <button
                            key={o.value}
                            type="button"
                            aria-pressed={theme === o.value}
                            onClick={() => themeStore.actions.setPreference(o.value)}
                            className={cn(
                                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                                theme === o.value
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <o.icon className="size-4" /> {o.label()}
                        </button>
                    ))}
                </div>
            </SwitchRow>
            <SwitchRow label={m.appearance_language()}>
                <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                    <SelectTrigger className="w-44 rounded-full" aria-label={m.appearance_language()}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {locales.map((l) => (
                            <SelectItem key={l} value={l}>
                                {LOCALE_LABEL[l]()}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SwitchRow>
        </SettingsCard>
    );
}
