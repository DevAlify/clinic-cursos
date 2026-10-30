import type { Fields, Level } from '@/lib/api.ts';
import { cn } from '@/lib/utils';
import { FIELD_LABEL, channelLabel, fieldValueLabel, howWeKnew, levelLabel } from '@/lib/format.ts';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const LEVELS: Level[] = ['observed', 'declared', 'inferred', 'unknown'];
export const LEVEL_ICON: Record<Level, string> = { observed: '●', declared: '◐', inferred: '◇', unknown: '?' };
export const LEVEL_HELP: Record<Level, string> = {
  observed: 'O sistema viu a prova (QR, UTM, código).',
  declared: 'A pessoa contou ("vi no insta").',
  inferred: 'O sistema deduziu por uma regra com nome.',
  unknown: 'Não há prova, e o sistema diz isso em vez de chutar.',
};
const TONE: Record<Level, string> = {
  observed: 'bg-observed-soft text-observed',
  declared: 'bg-declared-soft text-declared',
  inferred: 'bg-inferred-soft text-inferred',
  unknown: 'bg-unknown-soft text-unknown',
};
export const BAR: Record<Level, string> = {
  observed: 'bg-bar-observed', declared: 'bg-bar-declared', inferred: 'bg-bar-inferred', unknown: 'bg-bar-unknown',
};
const EDGE: Record<Level, string> = {
  observed: 'border-l-observed', declared: 'border-l-declared', inferred: 'border-l-inferred', unknown: 'border-l-unknown',
};

// Level is always text plus icon plus color, never color alone.
export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <Badge variant="secondary" title={LEVEL_HELP[level]} className={cn('h-auto rounded-sm px-[0.4375rem] py-0.5 text-meta font-semibold', TONE[level], className)}>
      <span aria-hidden="true">{LEVEL_ICON[level]}</span>
      {levelLabel(level)}
    </Badge>
  );
}

export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('block font-mono text-xs break-words text-muted-foreground', className)}>{children}</span>;
}

// Origin summary used on list rows and cards: the channel's level badge plus the channel in words.
export function OriginSummaryView({ origin }: { origin: Fields | null }) {
  const channel = origin?.channel;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <LevelBadge level={channel?.level ?? 'unknown'} />
      {channel?.value != null && <span className="text-meta">{channelLabel(channel.value)}</span>}
    </span>
  );
}

const FIELD_ORDER = ['entryPoint', 'channel', 'campaign', 'unit', 'product'] as const;
const technical = (reader: string, evidence?: string) => (evidence ? `${reader} · ${evidence}` : reader);

// Full table of the five origin fields, as in the approved mockup.
export function FieldTable({ fields, entryLabels = {} }: { fields: Fields; entryLabels?: Record<string, string> }) {
  return (
    <div className="rounded-md border">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-background hover:bg-background">
            <TableHead className="w-[18%]">Campo</TableHead>
            <TableHead className="w-[25%]">Valor</TableHead>
            <TableHead className="w-[21%]">Nível</TableHead>
            <TableHead className="w-[36%]">Como soubemos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {FIELD_ORDER.map((name) => {
            const f = fields[name];
            const value = name === 'entryPoint' && f.value ? (entryLabels[f.value] ?? f.value) : fieldValueLabel(name, f.value);
            return (
              <TableRow key={name}>
                <TableCell className={cn('border-l-[3px] align-top whitespace-normal', EDGE[f.level])}>{FIELD_LABEL[name]}</TableCell>
                <TableCell className="align-top whitespace-normal break-words">{value}{f.value && <Code>{f.value}</Code>}</TableCell>
                <TableCell className="align-top"><LevelBadge level={f.level} /></TableCell>
                <TableCell className="align-top whitespace-normal break-words">{howWeKnew(f.reader, f.evidence)}<Code>{technical(f.reader, f.evidence)}</Code></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// Narrow version of the same information for the side card.
export function FieldList({ fields, entryLabels = {} }: { fields: Fields; entryLabels?: Record<string, string> }) {
  return (
    <ul className="divide-y rounded-md border">
      {FIELD_ORDER.map((name) => {
        const f = fields[name];
        const value = name === 'entryPoint' && f.value ? (entryLabels[f.value] ?? f.value) : fieldValueLabel(name, f.value);
        return (
          <li key={name} className={cn('border-l-[3px] px-3 py-2', EDGE[f.level])}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 truncate text-sm" title={value}>
                <span className="text-meta text-muted-foreground">{FIELD_LABEL[name]}</span> <span className="font-medium">{value}</span>
              </div>
              <LevelBadge level={f.level} />
            </div>
            <div className="mt-0.5 text-meta text-muted-foreground">Como soubemos: {howWeKnew(f.reader, f.evidence)}</div>
            <Code>{technical(f.reader, f.evidence)}</Code>
          </li>
        );
      })}
    </ul>
  );
}

// Stacked bar with the mix of levels; the numbers are always spelled out in the aria-label.
export function LevelBar({ counts, label }: { counts: Record<Level, number>; label: string }) {
  const text = LEVELS.map((l) => `${counts[l]} ${levelLabel(l)}`).join(', ');
  return (
    <div role="img" aria-label={`${label}: ${text}`} className="mt-2 flex h-[0.6875rem] gap-0.5 overflow-hidden rounded-xs bg-muted">
      {LEVELS.map((l) => (counts[l] > 0 ? <span key={l} className={cn('min-w-1', BAR[l])} style={{ flex: counts[l] }} /> : null))}
    </div>
  );
}
