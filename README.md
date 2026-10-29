# Clinic Cursos: rastreamento confiável de origem (demo)

Demo local do desafio Product Builder / FDE da Clinic Cursos. Um log de eventos só de acréscimo guarda tudo o que acontece (formulário, WhatsApp, QR, venda do ERP); pessoa, toques, oportunidades, filas e alertas são calculados a partir dele, e é assim que a origem de cada lead chega inteira até a venda.
A demo percorre a sequência do PDF (entrada identificada, contato e oportunidade, encaminhamento, venda confirmada no ERP) com seis personagens, e cada cenário pedido vira uma verificação automática.

**Todos os dados são fictícios:** nomes inventados, telefones de faixas reservadas, e-mails `@example.com`. Nenhum dado real da Clinic entra aqui.

## Requisitos

- Node 24.12 ou mais novo (24.x ou 26), ou Docker.
- O Node executa os arquivos `.ts` direto, sem etapa de compilação.
- O repositório traz um `.npmrc` com `ignore-scripts=true`: o npm não roda scripts de instalação dos pacotes.
- Não precisa de internet para `verify`, `test` e `replay`; só a instalação dos pacotes usa a rede.

## Como rodar

```bash
npm install                       # instala os pacotes (use npm ci para seguir o lockfile à risca)
npm run verify                    # roda os seis cenários do zero e mostra esperado × obtido
npm run demo                      # constrói o simulador e sobe o servidor em http://localhost:3000
npm run replay -- --window 14     # refaz a atribuição com janela de 14 dias e mostra o que mudaria
docker compose up --build         # plano B, sem Node na máquina; depois abra http://localhost:3000
```

- `npm run verify` termina com erro se qualquer verificação falhar.
- `npm run demo` sobe o servidor na porta 3000 (`PORT` muda a porta). Cada vez que o servidor sobe, o banco (`data/demo.db`) recomeça do zero com os dados fictícios.
- `npm run replay` roda os cenários num banco em memória e só mostra a prévia; não mexe em `data/demo.db`.
- `docker compose up --build` usa a imagem `node:26` (a completa, com as ferramentas de compilação). A primeira construção demora alguns minutos. Para parar: `docker compose down`.
- Outros comandos: `npm test` (testes de unidade e de cenário, `node:test`) e `npm run typecheck` (confere os tipos).

## Resultado esperado

Saída real de `npm run verify`, colada depois de rodar neste repositório:

```text
1. Origem preservada até a venda
  OK     Formulário e WhatsApp da Ana na mesma ficha (nono dígito corrigido)     obtido: 1 ficha(s) · 2 toque(s)
  OK     A conversa da Ana vai para vendas de SP                                 obtido: sales-sp

2. QR de unidade × WhatsApp sem origem
  OK     Carla entra pelo banner do Rio, lida pelo código K7P2                   obtido: rj-banner-recepcao-01 · code:K7P2 · canal qr (observed)
  OK     O QR foi lido uma vez                                                   obtido: 1 leitura(s)
  OK     Carla vai para a fila de vendas do Rio                                  obtido: sales-rj
  OK     Daniel: canal e campanha desconhecidos, sem chute                       obtido: canal unknown · campanha unknown
  OK     Daniel vai para vendas de Campinas, com a unidade inferida pelo número  obtido: sales-cps · unidade inferred
  OK     Daniel declara o Instagram: canal declarado, lido pela IA               obtido: instagram · declared · ai:simulated-v1 · "Vi no insta"
  OK     A oportunidade do Daniel aponta para o toque declarado                  obtido: instagram (declared) · campanha — (unknown)

3. Pessoa existente volta por outra campanha
  OK     Bruna continua uma ficha só: paciente e lead em Campinas                obtido: 1 ficha(s) · lead@cps, patient@cps
  OK     Novo interesse (hof · cps) com google_ads e campanha observados         obtido: google_ads (observed) · campanha cps_hof_captacao_202610 (observed)
  OK     O histórico de paciente continua desconhecido, com o lote               obtido: unknown · import:erp-pacientes-2026-09

4. O mesmo evento chega duas vezes
  OK     A mensagem repetida não cria outro toque                                obtido: 1 toque(s)
  OK     A repetição fica contada                                                obtido: 1 repetição(ões)
  OK     A conversa não é encaminhada duas vezes                                 obtido: 1 encaminhamento(s)

5. Venda confirmada pelo ERP
  OK     A venda do Eduardo vai para a fila de conciliação                       obtido: reconciliation · ERP-SALE-0999
  OK     A oportunidade da Ana fica ganha e ligada ao anúncio da Meta            obtido: won · ERP-SALE-1001 · meta_ads (observed) · campanha sp_hof_captacao_202610 (observed)

6. Falha: a LP de Campinas perde as UTMs
  OK     Felipe, Gabriela e Helena: canal observado e campanha desconhecida      obtido: google_ads/unknown · google_ads/unknown · google_ads/unknown
  OK     Um alerta para cps-lp-hof-01, com ação e responsável                    obtido: LP de harmonização de Campinas parou de enviar a campanha desde as 14h05. 3 leads afetados. Conferir a página publicada. Responsável: marketing.
  OK     O ponto vai para "em auditoria"                                         obtido: auditing
  OK     Com o lead de teste aprovado, o dono libera o ponto                     obtido: released
  OK     Os três leads continuam com a campanha desconhecida                     obtido: unknown · unknown · unknown

Extra: privacidade e log
  OK     O log não guarda telefone, e-mail nem nome em claro                     obtido: nenhum dado pessoal no log
  OK     O log recusa alteração                                                  obtido: SqliteError: events are append-only

Extra: reprocessamento
  OK     Refazer as projeções a partir do log dá o mesmo estado                  obtido: estado comparado antes e depois
  OK     Com janela de 14 dias, só a atribuição da Carla muda                    obtido: Carla Mendes: qr → desconhecida

Extra: retorno direto
  OK     Carla volta direto e a oportunidade (hof · rj) fica com o QR de 10/10   obtido: K7P2 · 2026-10-10 · qr (observed) · campanha rj_cursos_divulgacao_202610 (observed)

27 de 27 verificações passaram.
```

Os termos entre parênteses são os níveis de certeza da origem: `observed` (observada: o sistema viu o dado chegar), `declared` (declarada: a pessoa disse), `inferred` (inferida: deduzida por uma regra) e `unknown` (desconhecida: sem prova, e o sistema não chuta).

## O que cada cenário prova

| Cenário do PDF | Personagens | Resultado esperado |
|---|---|---|
| Origem preservada até a venda | Ana | a venda fica ligada ao anúncio, com a campanha observada |
| QR de unidade e WhatsApp sem origem, registrados de forma distinta | Carla (QR da recepção do Rio) e Daniel (WhatsApp direto) | Carla com origem observada; Daniel com origem desconhecida até declarar |
| Pessoa existente volta por outra campanha | Bruna (paciente em Campinas, já importada do ERP com origem desconhecida e lote, que volta por um anúncio de curso no Google) | mesma ficha, oportunidade nova com origem própria e histórico de paciente intacto |
| O mesmo evento chega duas vezes | Carla (a mesma mensagem chega de novo) | um toque só, e a repetição fica contada |
| Venda confirmada pelo ERP | Ana (com o id) e Eduardo (sem ficha correspondente) | a oportunidade da Ana fica ganha; a venda do Eduardo vai para a fila de conciliação |
| Falha escolhida: a LP de Campinas perde as UTMs | Felipe, Gabriela e Helena | os três leads chegam com canal Google observado e campanha desconhecida; no terceiro, o alerta dispara com ação e responsável, o ponto vai para "em auditoria" e só o dono o libera, depois de um lead de teste |

Além dos seis cenários, `verify` confere três extras: o log não guarda dado pessoal em claro e recusa alteração; refazer as projeções a partir do log dá o mesmo estado; e uma regra nova de atribuição (janela de 14 dias) muda só o que deve mudar.

## O que é real e o que é simulado

**Real:**
- o núcleo: log de eventos só de acréscimo, cofre de dados pessoais, identidade por igualdade exata, origem com nível de certeza, atribuição, monitor de cobertura, reprocessamento e prévia de regra nova;
- as regras v1: janela de atribuição de 30 dias, limite de confiança da IA de 0,85, e alerta quando os 3 últimos leads de um ponto chegam sem campanha (com base de pelo menos 10 leads em 30 dias e cobertura de base de pelo menos 90%);
- as oito ferramentas tipadas (`explain_origin`, `origin_coverage`, `get_course_offer`, `route_conversation`, `open_opportunity`, `record_declared_origin`, `propose_merge`, `set_entry_point_status`), que pessoas, simulador e agentes de IA usam pelo mesmo caminho;
- a porta HTTP (webhooks do WhatsApp, do formulário e do ERP, o redirecionador de QR e links, e a API do simulador), com a conferência da assinatura da Meta no WhatsApp e do token no ERP.

**Simulado:**
- WhatsApp e ERP: as mensagens e as vendas vêm dos cenários, não de uma conta da Meta nem de um ERP; o catálogo de cursos do ERP é fictício;
- Hotmart: aparece só no gerador de links;
- IA: um classificador simulado (`ai:simulated-v1`), no lugar de um modelo de verdade. É em `src/ai/` que se troca o provedor.

## Dependências

Versões exatas, como estão em `package.json` e `web/package.json`.

| Pacote | Versão | Para que serve |
|---|---|---|
| hono | 4.13.14 | servidor HTTP pequeno e tipado |
| @hono/node-server | 2.1.5 | roda o Hono no Node |
| zod | 4.6.7 | valida as entradas e descreve as ferramentas |
| better-sqlite3 | 13.0.3 | banco SQLite num arquivo, sem servidor |
| typescript | 7.0.2 | só confere os tipos (o Node executa o código) |
| @types/node | 26.6.6 | tipos do Node |
| @types/better-sqlite3 | 9.6.0 | tipos do banco |
| react, react-dom | 19.3.1 | simulador |
| @types/react, @types/react-dom | 19.3.0 | tipos do simulador |
| vite | 8.3.5 | constrói o simulador |
| @vitejs/plugin-react | 6.1.2 | React no Vite |
| tailwindcss, @tailwindcss/vite | 4.3.3 | estilos do simulador |
| shadcn | 4.23.0 | componentes de interface e estilos-base do simulador |
| radix-ui | 1.8.1 | peças de acessibilidade usadas pelos componentes shadcn |
| class-variance-authority | 0.7.1 | variações de estilo dos componentes shadcn |
| clsx, tailwind-merge | 2.1.1, 3.7.0 | junção de classes CSS |
| tw-animate-css | 1.4.0 | animações dos componentes shadcn |
| lucide-react | 1.64.0 | ícones |
| @fontsource-variable/geist | 5.3.0 | fonte da interface |

Testes usam o `node:test`, que já vem no Node.

Exceções conhecidas:
- `class-variance-authority` está na 0.7.1 porque os componentes shadcn dependem dela e não existe versão 1.x estável.
- `npm audit` aponta 3 achados de severidade baixa (`deepmerge`, via `@shadcn/registry`, dentro da CLI do `shadcn`). Esse código não vai para o pacote do simulador.

## Segredos de demonstração

Três variáveis de ambiente, todas com valor padrão de demonstração (nenhum segredo real está no repositório):

| Variável | Valor padrão | Uso |
|---|---|---|
| `WHATSAPP_APP_SECRET` | `demo-whatsapp-secret` | confere a assinatura dos webhooks do WhatsApp |
| `ERP_TOKEN` | `demo-erp-token` | autentica o webhook do ERP (cabeçalho `x-erp-token`) |
| `PII_HASH_KEY` | `demo-pii-hash-key` | chave dos hashes de telefone e e-mail |

## Limites desta demo

A demo roda na sua máquina e deixa algumas portas abertas de propósito, para o simulador funcionar. Não a coloque numa rede aberta como está:

- o cabeçalho `x-occurred-at` deixa o chamador escolher a hora gravada do evento (é como a simulação mantém seu relógio fictício; só aceita data ISO 8601 com fuso);
- `/tools/*` confia no cabeçalho `x-actor` para saber o papel de quem chama;
- `/api/reset`, `/api/replay` e `/api/simulate/*` não têm autenticação;
- os segredos são os valores padrão de demonstração, lidos de variáveis de ambiente.

Antes de qualquer uso real, isso ficaria protegido: autenticação nas rotas, chamadas internas assinadas (em vez de papel autodeclarado e hora escolhida por quem chama) e segredos num gerenciador de segredos.

## Onde estão os documentos

- Documento de 5 páginas: `docs/documento.pdf`
- Registro (tempo, IA e ferramentas usadas, fontes, verificações e pendências): `docs/registro.md`
- Spec (desenho da solução): `docs/processo/2026-10-29-desenho.md`
- Plano de implementação: `docs/processo/2026-10-29-plano.md`
- Pesquisas e fontes consultadas: `docs/processo/pesquisa/`
