import { type AppSettings, aceDryPresetSchema, DEFAULT_DRY_PRESETS } from '@kobralink/shared';
import { useForm } from '@tanstack/react-form';
import { Plus, X } from 'lucide-react';
import { z } from 'zod';
import { FieldError, fieldInvalid } from '@/components/form/field-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/lib/i18n';
import { SettingsCard, useSaveSettings } from './settings-form-card';

export function DryPresetsCard({ settings }: { settings: AppSettings }) {
    const save = useSaveSettings();
    const form = useForm({
        defaultValues: { presets: settings.aceDryPresets },
        validators: { onSubmit: z.object({ presets: z.array(aceDryPresetSchema).max(20) }) },
        onSubmit: ({ value }) => save.mutateAsync({ aceDryPresets: value.presets }).catch(() => undefined),
    });
    return (
        <SettingsCard
            title={m.dry_presets_title()}
            description={m.dry_presets_hint()}
            onSubmit={() => void form.handleSubmit()}
            submitting={save.isPending}
            extra={
                <Button
                    type="button"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => form.setFieldValue('presets', DEFAULT_DRY_PRESETS)}
                >
                    {m.dry_presets_reset()}
                </Button>
            }
        >
            <form.Field name="presets" mode="array">
                {(field) => (
                    <div className="grid gap-2">
                        <div className="grid grid-cols-[1fr_6rem_6rem_2rem] gap-2 px-1 text-xs text-muted-foreground">
                            <span>{m.field_name()}</span>
                            <span>°C</span>
                            <span>min</span>
                            <span />
                        </div>
                        {field.state.value.map((_, i) => (
                            <div
                                key={`p-${String(i)}`}
                                className="grid grid-cols-[1fr_6rem_6rem_2rem] items-start gap-2"
                            >
                                <form.Field name={`presets[${i}].name`}>
                                    {(f) => (
                                        <div>
                                            <Input
                                                value={f.state.value}
                                                onChange={(e) => f.handleChange(e.target.value)}
                                                aria-invalid={fieldInvalid(f.state.meta)}
                                                className="rounded-full px-4"
                                            />
                                            <FieldError meta={f.state.meta} />
                                        </div>
                                    )}
                                </form.Field>
                                <form.Field name={`presets[${i}].targetTemp`}>
                                    {(f) => (
                                        <div>
                                            <Input
                                                type="number"
                                                min={30}
                                                max={80}
                                                value={Number.isNaN(f.state.value) ? '' : f.state.value}
                                                onChange={(e) => f.handleChange(e.target.valueAsNumber)}
                                                aria-invalid={fieldInvalid(f.state.meta)}
                                                className="rounded-full text-center"
                                            />
                                            <FieldError meta={f.state.meta} />
                                        </div>
                                    )}
                                </form.Field>
                                <form.Field name={`presets[${i}].duration`}>
                                    {(f) => (
                                        <div>
                                            <Input
                                                type="number"
                                                min={10}
                                                max={1440}
                                                step={10}
                                                value={Number.isNaN(f.state.value) ? '' : f.state.value}
                                                onChange={(e) => f.handleChange(e.target.valueAsNumber)}
                                                aria-invalid={fieldInvalid(f.state.meta)}
                                                className="rounded-full text-center"
                                            />
                                            <FieldError meta={f.state.meta} />
                                        </div>
                                    )}
                                </form.Field>
                                <button
                                    type="button"
                                    onClick={() => field.removeValue(i)}
                                    className="mt-2 flex size-6 items-center justify-center rounded-full hover:bg-secondary"
                                    aria-label={m.common_delete()}
                                >
                                    <X className="size-3.5" />
                                </button>
                            </div>
                        ))}
                        <div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="rounded-full"
                                disabled={field.state.value.length >= 20}
                                onClick={() => field.pushValue({ name: '', targetTemp: 50, duration: 240 })}
                            >
                                <Plus /> {m.dry_presets_add()}
                            </Button>
                        </div>
                    </div>
                )}
            </form.Field>
        </SettingsCard>
    );
}
