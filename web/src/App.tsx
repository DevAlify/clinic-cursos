import { ExternalLink } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AtendimentoView } from '@/components/atendimento/AtendimentoView';
import { BastidoresView } from '@/components/bastidores/BastidoresView';
import { CampanhasView } from '@/components/campanhas/CampanhasView';
import { CrmView } from '@/components/crm/CrmView';
import { useHashTab } from '@/lib/hooks.ts';

const TABS = [
  { id: 'atendimento', label: 'Atendimento' },
  { id: 'crm', label: 'CRM' },
  { id: 'campanhas', label: 'Campanhas' },
  { id: 'bastidores', label: 'Bastidores' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const TAB_IDS: readonly TabId[] = TABS.map((t) => t.id);

// The other two services run on their own ports of the same machine.
const ERP_PORT = 3100;
const WAHA_PORT = 3200;
const serviceUrl = (port: number) => `${window.location.protocol}//${window.location.hostname}:${port}`;

function ServiceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5" />
      <span className="sr-only">(abre em outra aba)</span>
    </a>
  );
}

export default function App() {
  const [tab, setTab] = useHashTab(TAB_IDS, 'atendimento');
  return (
    <TooltipProvider>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="h-dvh gap-0">
        <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:p-3">
          Ir para o conteúdo
        </a>
        <header className="flex h-12 shrink-0 items-center gap-6 border-b bg-card px-7">
          <div className="text-lg font-bold tracking-tight whitespace-nowrap">
            Clinic<span className="font-normal"> · sistema central (demo)</span>
          </div>
          <TabsList variant="line" aria-label="Áreas do sistema" className="h-full gap-4 p-0">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="h-full flex-none px-1 text-sm text-muted-foreground group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-[3px]">{t.label}</TabsTrigger>
            ))}
          </TabsList>
          <div className="ml-auto flex items-center gap-3">
            <ServiceLink href={serviceUrl(ERP_PORT)}>ERP</ServiceLink>
            <ServiceLink href={serviceUrl(WAHA_PORT)}>Celular do lead (WAHA)</ServiceLink>
            <span className="rounded-md border border-input px-2 py-0.5 text-meta">dados fictícios</span>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 outline-none">
          <TabsContent value="atendimento" className="h-full"><AtendimentoView /></TabsContent>
          <TabsContent value="crm" className="h-full"><CrmView /></TabsContent>
          <TabsContent value="campanhas" className="h-full overflow-y-auto"><CampanhasView /></TabsContent>
          <TabsContent value="bastidores" className="h-full overflow-y-auto"><BastidoresView /></TabsContent>
        </main>
      </Tabs>
    </TooltipProvider>
  );
}
