import { MCP_MODES, type McpMode, type McpToolDto } from '@kobralink/shared';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollAreaWithShadow } from '@/components/ui/scroll-area-with-shadow';
import { useIsAdmin } from '@/hooks/use-role';
import { useSaveSettings } from '@/hooks/use-save-settings';
import { m } from '@/lib/i18n';
import { appSettingsQuery, mcpToolsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const MODE_LABEL: Record<McpMode, () => string> = {
    allow: m.mcp_mode_allow,
    ask: m.mcp_mode_ask,
    deny: m.mcp_mode_deny,
};

const MODE_STYLE: Record<McpMode, string> = {
    allow: 'bg-primary text-primary-foreground',
    ask: 'bg-amber-500 text-black',
    deny: 'bg-destructive text-white',
};

function rules(tool: McpToolDto): string[] {
    return [
        ...(tool.destructive ? [m.mcp_rule_destructive()] : []),
        ...(tool.lock === 'always' ? [m.mcp_rule_lock_always()] : []),
        ...(tool.lock === 'sometimes' ? [m.mcp_rule_lock_sometimes()] : []),
        ...(tool.bedClear ? [m.mcp_rule_bed()] : []),
    ];
}

function ToolRow({
    tool,
    mode,
    disabled,
    onChange,
}: {
    tool: McpToolDto;
    mode: McpMode;
    disabled: boolean;
    onChange: (mode: McpMode) => void;
}) {
    const label = m[`mcp_tool_${tool.name}`]();
    return (
        <li className="flex flex-col gap-x-4 gap-y-2 py-2.5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <code className="font-mono text-xs text-muted-foreground">{tool.name}</code>
                    {rules(tool).map((rule) => (
                        <Badge key={rule} variant="secondary" className="font-normal">
                            {rule}
                        </Badge>
                    ))}
                </div>
            </div>
            <fieldset
                aria-label={label}
                disabled={disabled}
                className="flex shrink-0 gap-1 self-start rounded-full bg-secondary p-1 sm:self-center"
            >
                {MCP_MODES.map((value) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={mode === value}
                        onClick={() => mode !== value && onChange(value)}
                        className={cn(
                            'rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60',
                            mode === value ? MODE_STYLE[value] : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {MODE_LABEL[value]()}
                    </button>
                ))}
            </fieldset>
        </li>
    );
}

export function McpToolsCard() {
    const isAdmin = useIsAdmin();
    const tools = useQuery(mcpToolsQuery);
    const settings = useQuery(appSettingsQuery);
    const save = useSaveSettings();
    const modes = settings.data?.mcpTools ?? {};
    const list = tools.data ?? [];
    const groups = [
        { access: 'read', title: m.mcp_tools_read },
        { access: 'control', title: m.mcp_tools_control },
    ].map((g) => ({ ...g, tools: list.filter((t) => t.access === g.access) }));

    return (
        <Card className="rounded-3xl">
            <CardHeader>
                <CardTitle>{m.mcp_tools_title()}</CardTitle>
                <CardDescription>{m.mcp_tools_hint()}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
                <ScrollAreaWithShadow bottomShadow viewportClassName="max-h-[32rem]">
                    <div className="space-y-6 px-6">
                        {groups.map((g) => (
                            <section key={g.access}>
                                <h3 className="text-sm font-medium text-primary-strong">
                                    {g.title({ n: g.tools.length })}
                                </h3>
                                <ul className="divide-y">
                                    {g.tools.map((t) => (
                                        <ToolRow
                                            key={t.name}
                                            tool={t}
                                            mode={modes[t.name] ?? t.defaultMode}
                                            disabled={!isAdmin || save.isPending || !settings.data}
                                            onChange={(mode) => save.mutate({ mcpTools: { [t.name]: mode } })}
                                        />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                </ScrollAreaWithShadow>
            </CardContent>
        </Card>
    );
}
