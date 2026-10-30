# Registro do trabalho

Desafio Product Builder / FDE da Clinic Cursos, de 28 a 30/10/2026. Dados e exemplos fictícios; nenhum acesso aos sistemas da Clinic.

## Tempo

**Passei do limite sugerido de 4 horas.** Somando leitura, pesquisa, desenho, implementação e documento, foram cerca de **7h45 de trabalho ativo**, mais o tempo dos agentes que trabalharam em paralelo. Escolhi investir no desenho (quatro seções aprovadas uma a uma), na verificação (testes, revisões cruzadas e prova ponta a ponta) e, no fim, numa demo que mostra o sistema em uso, e não só os registros. O PDF pede pesquisa e demonstração dentro das 4 horas; registro aqui o excesso em vez de escondê-lo.

Como medi: horários da sessão de trabalho, agrupados em blocos sem pausa maior que 20 minutos. Leitura do PDF fora da sessão não entrou.

| Bloco | Horário | Ativo | Atividade |
|---|---|---|---|
| 1 | 28/10 14:03–14:08 | 5 min | primeira leitura do desafio |
| 2 | 28/10 18:21–20:05 | 1h44 | leitura completa, perguntas de alinhamento, escolha da stack com versões estáveis, quatro pesquisas em paralelo (alternativas, fatos oficiais, contexto da Clinic, versões), início do desenho |
| 3 | 29/10 10:07–11:37 | 1h29 | desenho em quatro seções, revisão crítica de arquitetura, spec escrita e aprovada |
| 4 | 29/10 11:58–13:10 | 1h12 | plano de implementação (TDD, contratos), repositório privado, base do projeto, mockup e revisão de UX |
| 5 | 29/10 15:08–16:37 | 1h29 | núcleo (log, identidade, origem, regras), projeções, ferramentas e IA, porta HTTP e cenários, Docker e README, documento v1; correção do alvo da demo e Plano v2 |
| 6 | 29/10 20:00–21:00 | ~1h | sistema central: mensagens, provedores Meta e WAHA, agente que responde, pipeline, ERP e WAHA como serviços, produto em React, integração e prova ponta a ponta, documento v2, revisões |
| 7 | 30/10 01:57–02:45 | ~48 min | revisões da leva (segurança, revisão cruzada do Codex, tech-lead) e as correções que elas pediram, com teste; prova de novo no Docker; merge |

Contagem extra, a partir do primeiro commit (29/10 11:36): cerca de 4h30 de trabalho ativo até a entrega (blocos 4 a 7). Entre 13:10 e 15:08 e entre 16:37 e 20:00 de 29/10, os limites de uso das ferramentas de IA pararam o trabalho; entre 21:00 de 29/10 e 01:57 de 30/10, esperei o limite do Claude e do Codex voltar. Esse tempo não entrou.

## IA e ferramentas usadas

| Ferramenta | Papel | O que conferi à mão |
|---|---|---|
| Claude Code, Opus 5.5 | orquestração, desenho, spec, plano, decisões, revisão do documento | cada seção do desenho foi aprovada por mim; li o PDF final página por página e as capturas de tela |
| Claude Code, Fable 5.1 | correção do alvo da demo (sistema central em uso) e Plano v2 | aprovei a redefinição antes da execução |
| Subagentes Claude Sonnet 5.5 | implementação (plano B quando o Codex bateu no limite), documento, README, produto em React, integração, revisões cruzadas e revisão de segurança | relatórios de cada tarefa; resultados de teste e `verify` conferidos |
| Subagente Claude Opus 5.5 | implementação do sistema central (mensagens, provedores, agente, pipeline) e revisão final (tech-lead) | decisões fora do contrato listadas no relatório e aceitas uma a uma |
| Codex (gpt-6.1-sol) | implementação do núcleo (log, cofre, identidade, origem, regras), revisões cruzadas e as correções finais (replay, unidade, venda, triagem, reenvio do ERP) | o que o Codex fez foi revisado por um subagente Claude, e vice-versa |
| Codex (gpt-6-astra) | mockup visual | revisão de UX independente antes da minha aprovação |

A IA da demo é simulada (regras de palavras com o mesmo contrato de um modelo real). Nenhuma API paga foi usada.

## Fontes consultadas

Todas com data, em `docs/processo/pesquisa/`:
- WhatsApp Cloud API, Meta Ads, CAPI, Termos das Business Tools e Termos do WhatsApp (§4.7): developers.facebook.com e facebook.com/legal, 28 e 29/10/2026.
- WAHA (eventos e envio): waha.devlike.pro, 29/10/2026.
- Google Ads (gclid, `click_view`) e Google Analytics (UTM, PII em URL): 28 e 29/10/2026.
- Hotmart (`sck`/`src`, webhook) e RD Station (eventos, webhooks): 28/10/2026.
- LGPD (Lei 13.709/2018) e guias da ANPD: planalto.gov.br e gov.br/anpd, 28/10/2026.
- Chatwoot e Twenty (repositórios, licenças, versões, preços) e a triagem de Frappe, Odoo, Krayin, EspoCRM, SuiteCRM e Zammad: 28/10/2026.
- Versões de dependências: registro do npm, 28 e 29/10/2026.

## Verificações feitas

| Comando | Resultado |
|---|---|
| `npm test` | 130 testes passando |
| `npm run verify` | 36 de 36 verificações passaram |
| `npm run replay -- --window 14` | só a atribuição da Carla muda (QR observado → desconhecida) |
| `npm run typecheck` | limpo na raiz e no web |
| `npm run build:web` | build ok |
| `npm run demo`, ao vivo | Ana escreve pelo celular simulado; a IA responde com vagas e preço lidos do ERP; a atendente assume, avança e registra a pré-matrícula; o ERP cria o pedido, o pagamento volta ao CRM e a oportunidade fica ganha com a origem preservada |
| `docker compose up --build` | três contêineres; o mesmo circuito funcionou entre eles. Conferido de novo em 30/10, depois das correções: a mensagem do celular chega ao core, a IA responde com preço e vagas lidos do ERP, e o "Recomeçar" zera os três |
| `npx npm@11 ci` em clone limpo | instalação ok no Windows com o `.npmrc` |
| Revisão de interface (diretrizes da Vercel) | 5 correções de acessibilidade aplicadas |
| Revisões cruzadas e final | base, núcleo (log, cofre, identidade, origem, regras): revisão cruzada aprovada e tech-lead. Branch integrada, em 30/10: revisão de segurança (APPROVE_WITH_NOTES, correções aplicadas); revisão cruzada do Codex com risco alto pediu 4 correções (origem por unidade quando a mesma pessoa fala com duas unidades, conferência de pessoa, curso e unidade antes de a venda ganhar, encaminhamento quando a triagem ganha intenção, reenvio do aviso de pagamento do ERP), feitas com teste e aprovadas na 2ª rodada; tech-lead: APPROVE_WITH_NOTES, e os 3 pontos importantes (o "Recomeçar" não zerava o ERP, as horas de 30/10 fora deste registro, uma origem prometida no README que aquele caminho não produz) corrigidos e revisados |
| Bug achado na revisão | `/api/replay` falhava com o banco em arquivo (modo WAL); corrigido com teste que abre o banco real |

## Pendências e o que ficou de fora

1. **Achados menores declarados:** se o core recusar para sempre o aviso de pagamento, o ERP tenta de novo a cada segundo, sem limite (não duplica a venda; em produção, espera crescente e fila de erro); os atalhos do produto para o ERP e o celular usam as portas padrão 3100 e 3200.
2. **Fora da demo, descrito no documento:** troca de número no WhatsApp, entrada de vendas da Hotmart, consentimento por finalidade, envio a RD, Meta e Google com filtro pela classe do dado, apagamento definitivo de pessoa (com chave por pessoa), confirmação da conciliação em um clique, tela de fusão de fichas, busca da campanha pelo gclid, modelo de IA real.
3. **Limites da demo, declarados no README:** sem autenticação nas rotas; o cabeçalho `x-occurred-at` deixa a simulação escolher o horário; `/tools` confia no `x-actor`; segredos de demonstração; com a chave HMAC do WAHA vazia, qualquer corpo é aceito; o webhook espera a reação da IA (em produção, gravar, responder 200 e reagir por fila); um único `META_PHONE_NUMBER_ID`.
4. **Exceções de dependência:** class-variance-authority 0.7.1 (exigida pelos componentes do shadcn, sem versão estável publicada); 3 alertas baixos do `npm audit` dentro da ferramenta de linha de comando do shadcn, fora do código servido.
5. **Produto:** telas abaixo de 1280 px não foram adaptadas; a ficha do CRM não prende o foco do teclado; a seleção não vai para a URL.
6. **`verify`:** prova o núcleo com o cliente local do ERP; cada ligação HTTP entre os serviços tem teste próprio (`test/services.test.ts`, `test/erp-notification.test.ts`); o circuito inteiro, com os três juntos, está provado na demo ao vivo.
7. **Cofre:** o texto das mensagens é guardado por valor; duas pessoas com a mesma mensagem dividem a mesma linha (em produção, chave por pessoa).
