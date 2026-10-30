# Clinic Cursos: rastreamento confiável de origem (demo)

Demo local do desafio Product Builder / FDE da Clinic Cursos: o sistema central em uso. Um log de eventos só de acréscimo guarda tudo o que acontece (formulário, WhatsApp, QR, venda do ERP); pessoa, toques, oportunidades, filas e alertas são calculados a partir dele, e é assim que a origem de cada lead chega inteira até a venda.
São **três serviços locais que imitam máquinas diferentes da operação** (o sistema central, um ERP e um simulador do WhatsApp), e a sequência do PDF (entrada identificada, contato e oportunidade, atendimento, pré-matrícula no ERP, venda confirmada de volta) passa pelos três. Oito personagens fictícios percorrem os cenários, e cada cenário pedido vira uma verificação automática.

**Todos os dados são fictícios:** nomes inventados, telefones de faixas reservadas, e-mails `@example.com`. Nenhum dado real da Clinic entra aqui.

## Requisitos

- Node 24.12 ou mais novo (24.x ou 26), ou Docker.
- O Node executa os arquivos `.ts` direto, sem etapa de compilação.
- O repositório traz um `.npmrc` com `ignore-scripts=true`: o npm não roda scripts de instalação dos pacotes.
- Não precisa de internet para `verify`, `test` e `replay`; só a instalação dos pacotes usa a rede.

## Como rodar

```bash
npm install                       # instala os pacotes (use npm ci para seguir o lockfile à risca)
npm run verify                    # roda os sete cenários do zero e mostra esperado × obtido
npm run demo                      # constrói o produto e sobe os três serviços (portas 3000, 3100 e 3200, escutando só em `127.0.0.1`)
npm run replay -- --window 14     # refaz a atribuição com janela de 14 dias e mostra o que mudaria
docker compose up --build         # plano B, sem Node na máquina; um contêiner por serviço
```

- `npm run verify` termina com erro se qualquer verificação falhar. Ele (como `test` e `replay`) roda o `core` sozinho, sem rede: o catálogo do ERP é o local, os pedidos saem como `LOCAL-n` e as respostas ficam registradas sem envio. O circuito pelos três serviços de verdade, em três processos falando HTTP, é o `npm run demo`.
- `npm run demo` abre três processos (um por serviço), imprime as três URLs e os encerra juntos com Ctrl+C. Se existir um `.env`, ele é lido (veja "Senhas de demonstração"); sem `.env`, vale o padrão do `.env.example`. Cada vez que o core e o ERP sobem, os bancos (`data/demo.db`, `data/erp.db`) recomeçam do zero com os dados fictícios.
- Para subir um serviço só: `npm run start:core`, `npm run start:erp` ou `npm run start:waha`.
- `npm run replay` roda os cenários num banco em memória e só mostra a prévia; não mexe em `data/demo.db`.
- `docker compose up --build` usa a imagem `node:26` (a completa, com as ferramentas de compilação), uma só para os três serviços. A primeira construção demora alguns minutos. Para parar: `docker compose down`.
- Outros comandos: `npm test` (testes de unidade e de cenário, `node:test`) e `npm run typecheck` (confere os tipos).

## Os três serviços

Cada serviço é um processo (ou contêiner) com porta, banco e variáveis próprios; falam entre si só por HTTP, como falariam máquinas diferentes.

| Serviço | Porta | O que é | Página |
|---|---|---|---|
| `core` | 3000 | o sistema central: atendimento, agente de IA, CRM, rastreamento e campanhas | o produto: Atendimento, CRM, Campanhas e Bastidores |
| `erp` | 3100 | ERP simulado, outro sistema: catálogo, pedidos, pagamentos e vagas | lista de pedidos com o botão "Confirmar pagamento" e o catálogo com as vagas |
| `waha` | 3200 | simulador compatível com o WAHA: mesmo webhook, mesma rota de envio, mesma chave e mesmo HMAC | "celular do lead": escolhe a pessoa, lê o QR do banner do Rio, manda mensagem e vê as respostas |

O caminho de uma venda, do começo ao fim. Para ver a origem observada, comece pelo anúncio: no Bastidores, rode o roteiro até "Ana · Clica no anúncio da Meta e preenche a LP de SP". Sem esse passo, a conversa começa sem link rastreado, e a origem só aparece se a pessoa responder à pergunta da IA.

1. No "celular do lead" (`waha`, :3200), a pessoa manda uma mensagem; o celular mostra as turmas abertas lidas do `erp`, como atalho para a conversa. O simulador monta o webhook do WAHA, assina com HMAC sha512 e entrega ao `core`.
2. O `core` identifica a origem, abre a conversa e a oportunidade, e responde pelo WhatsApp (a resposta chega ao celular pela rota de envio do WAHA). O preço e as vagas da resposta vêm do `erp`. Quem pergunta de cursos sem dizer qual recebe a lista das turmas abertas; se responder só a unidade, recebe a turma dela, e um "sim" abre a oportunidade (a atendente também pode abri-la pelo botão "Abrir oportunidade").
3. A atendente avança a etapa e registra a pré-matrícula: o `core` cria o pedido no `erp` (:3100) com o id da oportunidade.
4. No `erp`, "Confirmar pagamento" baixa a vaga e avisa o `core` pelo webhook de venda; a oportunidade fica ganha e leva a origem que o sistema conseguiu provar: observada, se a pessoa veio de um link rastreado (anúncio, QR, formulário); declarada, se respondeu à pergunta da IA; desconhecida, se nada disso aconteceu.

O botão "Guia da demo", no produto, mostra em que passo do roteiro da Ana a demo está (origem, mensagem, atendimento, venda no ERP e CRM) e o que fazer a seguir; o `core` calcula o estado em `GET /api/guide`, e o celular do lead também lê as turmas abertas pelo `erp`.

## Provedor de WhatsApp: Meta ou WAHA

O `core` fala com o WhatsApp por uma interface só (conferir a assinatura, ler a mensagem recebida, enviar texto), escolhida por `WHATSAPP_PROVIDER`. **Na operação real, o provedor é a Meta**; a demo usa o protocolo do WAHA contra o simulador local:

- **`meta`: o cenário real** (WhatsApp oficial da Meta, a Cloud API). O webhook vem assinado com `X-Hub-Signature-256` (HMAC sha256), traz o anúncio de origem e o id do usuário; o envio é `POST https://graph.facebook.com/v26.0/{META_PHONE_NUMBER_ID}/messages` com token Bearer. Texto livre só dentro da janela de 24 horas.
- **`waha`: o que a demo usa**, no protocolo do WAHA (alternativa não oficial, auto-hospedada, que automatiza o WhatsApp Web: há risco de bloqueio do número e não vem o dado do anúncio). O webhook é `event: "message"` com `payload.from` no formato `{número}@c.us` e HMAC sha512 em `X-Webhook-Hmac`; o envio é `POST {WAHA_URL}/api/sendText` com `{ session, chatId, text }` e `X-Api-Key`. Uma sessão por número da Clinic (`WAHA_SESSIONS`).

Na demo, `WHATSAPP_PROVIDER=waha` e `WAHA_URL` aponta para o simulador local (:3200), que fala o mesmo protocolo. **Trocar pelo WAHA de verdade é trocar a URL** (e a chave) **e parear o número**; trocar pela Meta é `WHATSAPP_PROVIDER=meta` com `META_ACCESS_TOKEN` e `META_PHONE_NUMBER_ID`. Nenhum código muda. Fontes: documentação do WAHA (eventos e envio de mensagens) e da Meta (envio de mensagens), consultadas em 29/10/2026.

## Resultado esperado

Saída real de `npm run verify`, colada depois de rodar neste repositório com os três serviços integrados:

```text
1. Origem preservada até a venda
  OK     Formulário e WhatsApp da Ana na mesma ficha (nono dígito corrigido)                  obtido: 1 ficha(s) · 2 toque(s)
  OK     A conversa da Ana vai para vendas de SP                                              obtido: sales-sp

2. QR de unidade × WhatsApp sem origem
  OK     Carla entra pelo banner do Rio, lida pelo código K7P2                                obtido: rj-banner-recepcao-01 · code:K7P2 · canal qr (observed)
  OK     O QR foi lido uma vez                                                                obtido: 1 leitura(s)
  OK     Carla vai para a fila de vendas do Rio                                               obtido: sales-rj
  OK     Daniel: canal e campanha desconhecidos, sem chute                                    obtido: canal unknown · campanha unknown
  OK     Daniel vai para vendas de Campinas, com a unidade inferida pelo número               obtido: sales-cps · unidade inferred
  OK     Daniel declara o Instagram: canal declarado, lido pela IA                            obtido: instagram · declared · ai:simulated-v1 · "Vi no insta"
  OK     A oportunidade do Daniel aponta para o toque declarado                               obtido: instagram (declared) · campanha sem valor (unknown)

3. Pessoa existente volta por outra campanha
  OK     Bruna continua uma ficha só: paciente e lead em Campinas                             obtido: 1 ficha(s) · lead@cps, patient@cps
  OK     Novo interesse (hof · cps) com google_ads e campanha observados                      obtido: google_ads (observed) · campanha cps_hof_captacao_202610 (observed)
  OK     O histórico de paciente continua desconhecido, com o lote                            obtido: unknown · import:erp-pacientes-2026-09

4. O mesmo evento chega duas vezes
  OK     A mensagem repetida não cria outro toque                                             obtido: 1 toque(s)
  OK     A repetição fica contada                                                             obtido: 1 repetição(ões)
  OK     A conversa não é encaminhada duas vezes                                              obtido: 1 encaminhamento(s)

5. Venda confirmada pelo ERP
  OK     A venda do Eduardo vai para a fila de conciliação                                    obtido: reconciliation · ERP-SALE-0999
  OK     O pagamento confirmado deixa a oportunidade da Ana ganha, ligada ao anúncio da Meta  obtido: won · pedido LOCAL-1 · venda ERP-SALE-1001 · meta_ads (observed) · campanha sp_hof_captacao_202610 (observed)

6. Falha: a LP de Campinas perde as UTMs
  OK     Felipe, Gabriela e Helena: canal observado e campanha desconhecida                   obtido: google_ads/unknown · google_ads/unknown · google_ads/unknown
  OK     Um alerta para cps-lp-hof-01, com ação e responsável                                 obtido: LP de harmonização de Campinas parou de enviar a campanha desde as 14h05. 3 leads afetados. Conferir a página publicada. Responsável: marketing.
  OK     O ponto vai para "em auditoria"                                                      obtido: auditing
  OK     Com o lead de teste aprovado, o dono libera o ponto                                  obtido: released
  OK     Os três leads continuam com a campanha desconhecida                                  obtido: unknown · unknown · unknown

7. Atendimento: IA, pessoa e pedido no ERP
  OK     A IA responde a Ana com 3 vagas e R$ 7.900, citando o ERP                            obtido: Olá, Ana! A turma de Harmonização Facial em São Paulo começa em 14/11, custa R$ 7.900 e tem 3 vagas (consultado no ERP às 14:10). Quer garantir a sua?
  OK     A IA pergunta ao Daniel como conheceu a Clinic, com opções                           obtido: Olá, Daniel! A turma de Harmonização Facial em Campinas começa em 28/11, custa R$ 7.600 e tem 2 vagas (consultado no ERP às 15:00). Quer garantir a sua? Antes, como você conheceu a Clinic? Instagram, Google, indicação ou outro?
  OK     O inchaço da Helena vai para a equipe clínica                                        obtido: clinical-team
  OK     A conversa da Helena passa para uma pessoa                                           obtido: modo human · fila clinical-team
  OK     A IA só acolhe: nenhuma resposta de mérito nem dado do ERP                           obtido: Olá, Helena! Sinto muito pelo incômodo. Não posso orientar sobre isso por aqui, então já passei sua mensagem para a nossa equipe clínica, que vai falar com você neste número.
  OK     A atendente assume a conversa da Ana                                                 obtido: modo human
  OK     A resposta da atendente fica na conversa da Ana                                      obtido: attendant:joana: Oi, Ana! Aqui é a Joana, da Clinic SP. Separei uma vaga para você na turma de 14/11. Posso fazer sua pré-matrícula?
  OK     A oportunidade da Ana avança para proposta                                           obtido: proposal
  OK     A pré-matrícula vira pedido no ERP, com o id da oportunidade                         obtido: pre_enrollment · pedido LOCAL-1 · oportunidade O40

Extra: privacidade e log
  OK     O log não guarda telefone, e-mail, nome nem texto de conversa                        obtido: nenhum dado pessoal no log
  OK     O log recusa alteração                                                               obtido: SqliteError: events are append-only

Extra: reprocessamento
  OK     Refazer as projeções a partir do log dá o mesmo estado                               obtido: estado comparado antes e depois
  OK     Com janela de 14 dias, só a atribuição da Carla muda                                 obtido: Carla Mendes: qr → desconhecida

Extra: retorno direto
  OK     Carla volta direto e a oportunidade (hof · rj) fica com o QR de 10/10                obtido: K7P2 · 2026-10-10 · qr (observed) · campanha rj_cursos_divulgacao_202610 (observed)

36 de 36 verificações passaram.
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
| Atendimento: a IA responde com dado do ERP, uma pessoa assume e o pedido vai ao ERP | Ana, Daniel e Helena | a IA responde com vagas e preço do ERP e pergunta a origem de quem não a trouxe; a dúvida clínica da Helena vai para a equipe, sem resposta de mérito; a atendente assume a conversa, avança a etapa e a pré-matrícula vira pedido no ERP com o id da oportunidade |

Além dos sete cenários, `verify` confere três extras: o log não guarda dado pessoal em claro (sem dado pessoal em claro; identificadores com hash de chave) e recusa alteração; refazer as projeções a partir do log dá o mesmo estado; e uma regra nova de atribuição (janela de 14 dias) muda só o que deve mudar.

## O que é real e o que é simulado

**Real:**
- o núcleo: log de eventos só de acréscimo, cofre de dados pessoais, identidade por igualdade exata, origem com nível de certeza, atribuição, monitor de cobertura, reprocessamento e prévia de regra nova;
- as regras v1: janela de atribuição de 30 dias, limite de confiança da IA de 0,85, e alerta quando os 3 últimos leads de um ponto chegam sem campanha (com base de pelo menos 10 leads em 30 dias e cobertura de base de pelo menos 90%);
- as doze ferramentas tipadas (`explain_origin`, `origin_coverage`, `get_course_offer`, `route_conversation`, `open_opportunity`, `record_declared_origin`, `propose_merge`, `set_entry_point_status`, e as do atendente: `reply_to_conversation`, `set_conversation_mode`, `advance_opportunity`, `request_enrollment`), que pessoas, simulador e agentes de IA usam pelo mesmo caminho;
- a porta HTTP (webhooks do WhatsApp (Meta e WAHA), do formulário e do ERP, o redirecionador de QR e links, e a API do produto, incluindo `GET /api/catalog`, as turmas lidas do ERP, e `GET /api/guide`, o passo atual do roteiro da demo), com a conferência da assinatura (Meta: sha256; WAHA: sha512) e do token do ERP;
- o protocolo entre os serviços: o webhook e a rota de envio do WAHA, e o pedido e o webhook de venda do ERP.

**Simulado:**
- WhatsApp e ERP: os serviços `waha` e `erp` são simuladores locais, não uma conta da Meta, um WAHA pareado ou um ERP de verdade; o catálogo, os preços e as vagas são fictícios;
- Hotmart: aparece só no gerador de links;
- IA: um classificador e um redator de respostas simulados (`ai:simulated-v1`), no lugar de um modelo de verdade; as respostas citam o que foi consultado no ERP. É em `src/ai/` que se troca o provedor.

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

Testes usam o `node:test`, que já vem no Node.

Exceções conhecidas:
- `class-variance-authority` está na 0.7.1 porque os componentes shadcn dependem dela e não existe versão 1.x estável.
- `npm audit` aponta 3 achados de severidade baixa (`deepmerge`, via `@shadcn/registry`, dentro da CLI do `shadcn`). Esse código não vai para o pacote do simulador.

## Senhas de demonstração

Tudo é configurado por variáveis de ambiente, com os valores padrão de demonstração listados em `.env.example` (nenhum segredo real está no repositório). Para mudar algum, copie o arquivo para `.env` (ele não vai para o git); `npm run demo` e `docker compose` o leem. No compose, as URLs dos serviços usam os nomes dos serviços (`http://core:3000`, `http://erp:3100`, `http://waha:3200`).

| Variável | Valor padrão | Uso |
|---|---|---|
| `WHATSAPP_PROVIDER` | `waha` | provedor de WhatsApp: `waha` ou `meta` |
| `HOST` | `127.0.0.1` | endereço de escuta dos três serviços (só esta máquina). No compose vale `0.0.0.0` dentro dos contêineres, e as portas são publicadas só em `127.0.0.1`. Não use `0.0.0.0` fora de um contêiner |
| `CORE_PORT`, `ERP_PORT`, `WAHA_PORT` | `3000`, `3100`, `3200` | portas dos três serviços |
| `CORE_URL`, `ERP_URL`, `WAHA_URL` | `http://localhost:3000`, `:3100`, `:3200` no `npm run demo`; no compose, os nomes dos serviços | como um serviço encontra o outro; o `core` sozinho (testes, `verify`) roda com `ERP_URL` e `WAHA_URL` vazios, sem rede |
| `ERP_TOKEN` | `demo-erp-token` | autentica o ERP (cabeçalho `x-erp-token`), nos dois sentidos |
| `WAHA_API_KEY` | `demo-waha-key` | chave da rota de envio do WAHA (`X-Api-Key`) |
| `WAHA_WEBHOOK_HMAC_KEY` | `demo-waha-hmac` | chave do HMAC sha512 do webhook do WAHA |
| `WAHA_SESSIONS` | `sp:551130000001,rj:552130000002,cps:551930000003` | uma sessão por número da Clinic (`nome:número`) |
| `META_APP_SECRET` | `demo-meta-secret` | confere a assinatura dos webhooks da Meta |
| `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID` | vazios | envio pela Meta (só no cenário real) |
| `PII_HASH_KEY` | `demo-pii-hash-key` | chave dos hashes de telefone e e-mail |

## Limites desta demo

A demo roda na sua máquina e deixa algumas portas abertas de propósito, para o simulador funcionar. Não a coloque numa rede aberta como está:

- o cabeçalho `x-occurred-at` deixa o chamador escolher a hora gravada do evento (é como a simulação mantém seu relógio fictício; só aceita data ISO 8601 com fuso);
- `/tools/*` confia no cabeçalho `x-actor` para saber o papel de quem chama;
- `/api/reset`, `/api/replay` e `/api/simulate/*` não têm autenticação, nem `/api/conversations/*`, que devolve o texto das conversas (inclusive uma queixa de saúde fictícia, dado sensível pela LGPD);
- as páginas e as leituras do ERP e do simulador do WAHA não têm autenticação (só a criação de pedidos e o reset do ERP, e o envio e o reset do WAHA, pedem chave), e "Confirmar pagamento" é um botão aberto;
- o ERP e o celular do lead guardam o estado em memória ou num arquivo que recomeça do zero a cada subida;
- os atalhos de ERP e celular no produto usam as portas padrão 3100 e 3200; mudar `ERP_PORT` ou `WAHA_PORT` não atualiza esses atalhos;
- os segredos são os valores padrão de demonstração, lidos de variáveis de ambiente;
- nenhuma rota tem autenticação, e a marca `test: true` do formulário é pública: qualquer chamador pode mandar um lead de teste (é ela que libera um ponto em auditoria);
- não há limite de requisições nem cabeçalhos de segurança (CSP, HSTS e afins);
- o estado de saúde dos pontos de entrada aparece no log e em `/api/state`, sem autenticação;
- `/api/reset` ("Recomeçar") apaga o banco do core e também zera o ERP e o celular do lead (pela chave de cada um), para o roteiro poder ser repetido; se um deles não responder, o core recomeça assim mesmo e diz qual falhou;
- os números da demo (vagas, preços, gasto de campanha, contagens) são inventados;
- privacidade: sem dado pessoal em claro no log; os identificadores guardam um hash de chave (HMAC com `PII_HASH_KEY`), que não é anonimização: quem tem a chave e o telefone refaz o hash. O cofre guarda o dado pessoal em claro, no banco local, sem criptografia;
- por padrão os serviços escutam só em `127.0.0.1` (`HOST`), e o compose publica as portas só nesse endereço; isso protege a demo na máquina, mas não substitui autenticação.

Antes de qualquer uso real, isso ficaria protegido: autenticação nas rotas, chamadas internas assinadas (em vez de papel autodeclarado e hora escolhida por quem chama) e segredos num gerenciador de segredos.

## Onde estão os documentos

- Documento de 5 páginas: `docs/documento.pdf`
- Registro (tempo, IA e ferramentas usadas, fontes, verificações e pendências): `docs/registro.md`
- Spec (desenho da solução): `docs/processo/2026-10-29-desenho.md`
- Plano de implementação: `docs/processo/2026-10-29-plano.md`
- Pesquisas e fontes consultadas: `docs/processo/pesquisa/`
