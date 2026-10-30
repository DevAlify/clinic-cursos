# Registro do trabalho

Desafio Product Builder / FDE da Clinic Cursos, de 28 a 30/10/2026. Dados e exemplos fictícios; nenhum acesso aos sistemas da Clinic.

## Tempo

**Passei do limite sugerido de 4 horas: foram 5h21 de tempo dedicado ao desafio** (até 30/10, 09:01; o fechamento final leva alguns minutos a mais). Escolhi investir no desenho (quatro seções aprovadas uma a uma), na verificação (testes, revisões cruzadas e prova ponta a ponta) e numa demo que mostra o sistema em uso, e não só os registros. O PDF pede pesquisa e demonstração dentro das 4 horas; registro aqui o excesso em vez de escondê-lo.

Como medi: nos registros da sessão de trabalho, conto só os trechos com atividade contínua. Pausas acima de 5 minutos não entram: nelas eu fazia outras coisas ou os agentes de IA rodavam sozinhos. As paradas por limite de uso das ferramentas de IA (cerca de 10 horas, em 29 e 30/10) também ficaram fora. Leitura do PDF fora da sessão não entrou.

| Bloco | Horário | Dedicado | Atividade |
|---|---|---|---|
| 1 | 28/10 14:03–14:07 | 0h05 | primeira leitura do desafio |
| 2 | 28/10 18:21–20:05 | 0h53 | leitura completa, perguntas de alinhamento, escolha da stack com versões estáveis, quatro pesquisas em paralelo (alternativas, fatos oficiais, contexto da Clinic, versões), início do desenho |
| 3 | 29/10 10:07–11:36 | 0h45 | desenho em quatro seções, revisão crítica de arquitetura, spec escrita e aprovada |
| 4 | 29/10 11:58–13:33 | 0h27 | plano de implementação (TDD, contratos), repositório privado, base do projeto, mockup e revisão de UX |
| 5 | 29/10 15:08–16:37 | 1h01 | núcleo (log, identidade, origem, regras), projeções, ferramentas e IA, porta HTTP e cenários, Docker e README, documento v1; correção do alvo da demo e Plano v2 |
| 6 | 29/10 20:00–20:54 | 0h19 | sistema central: mensagens, provedores, agente que responde, pipeline, ERP e celular como serviços, produto em React, integração, documento v2 |
| 7 | 30/10 01:57–02:44 | 0h47 | revisões da leva (segurança, revisão cruzada do Codex, tech-lead) e as correções que elas pediram, com teste; prova no Docker; merge |
| 8 | 30/10 02:50–04:01 | 0h39 | teste da demo por mim; onde travei virou o guia da demo: mockup, revisão de UX, aprovação e implementação |
| 9 | 30/10 06:14–09:01 | 0h24 | revisões do guia e do documento (Codex e tech-lead), documento v3, merge |
| | | **5h21** | |

Depois do fechamento, entre 09:01 e 11:47 de 30/10, fiz o documento complementar de arquitetura (`docs/arquitetura.pdf`, fora do que o PDF pede, com revisão do Codex) e preparei a apresentação: mais 0h41 de tempo dedicado, medido do mesmo jeito. Com o complementar, o total é 6h02.

## IA e ferramentas usadas

| Ferramenta | Papel | O que conferi à mão |
|---|---|---|
| Claude Code, Opus 5.5 | orquestração, desenho, spec, plano, decisões, revisão do documento | cada seção do desenho foi aprovada por mim; li o PDF final página por página e as capturas de tela |
| Claude Code, Fable 5.1 | correção do alvo da demo (sistema central em uso) e Plano v2 | aprovei a redefinição antes da execução |
| Subagentes Claude Sonnet 5.5 | implementação (plano B quando o Codex bateu no limite), documento, README, produto em React, integração, guia da demo e seus ajustes, documento v3, revisões cruzadas e revisão de segurança | relatórios de cada tarefa; resultados de teste e `verify` conferidos; testei a demo ao vivo |
| Subagente Claude Opus 5.5 | implementação do sistema central (mensagens, provedores, agente, pipeline) e revisão final (tech-lead) | decisões fora do contrato listadas no relatório e aceitas uma a uma |
| Codex (gpt-6.1-sol) | implementação do núcleo (log, cofre, identidade, origem, regras), revisões cruzadas, correções (replay, unidade, venda, triagem, reenvio do ERP, reset da demo), mockup do guia e parecer independente sobre o documento (82/100) | o que o Codex fez foi revisado por um subagente Claude, e vice-versa; juntei o parecer dele com o meu antes de editar o documento |
| Codex (gpt-6-astra) | primeiro mockup visual | revisão de UX independente antes da minha aprovação |

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
| `npm test` | 155 testes passando |
| `npm run verify` | 36 de 36 verificações passaram |
| `npm run replay -- --window 14` | só a atribuição da Carla muda (QR observado → desconhecida) |
| `npm run typecheck` | limpo na raiz e no web |
| `npm run build:web` | build ok |
| `npm run demo`, ao vivo | Ana escreve pelo celular simulado; a IA responde com vagas e preço lidos do ERP; a atendente assume, avança e registra a pré-matrícula; o ERP cria o pedido, o pagamento volta ao CRM e a oportunidade fica ganha com a origem preservada |
| Guia da demo, ao vivo | entrando pelo QR genérico do Rio sem citar curso (onde eu tinha travado): a IA lista as turmas, entende "São Paulo", abre a oportunidade no "sim" e passa para vendas; a atendente também abre a oportunidade pela tela; "tive uma intercorrência" vai para a equipe clínica |
| `docker compose up --build` | três contêineres; o mesmo circuito funcionou entre eles. Conferido de novo em 30/10, depois das correções: a mensagem do celular chega ao core, a IA responde com preço e vagas lidos do ERP, e o "Recomeçar" zera os três. Conferido mais uma vez com o guia: as turmas do celular vêm do ERP, e o caminho do QR genérico chega à oportunidade aberta |
| `npx npm@11 ci` em clone limpo | instalação ok no Windows com o `.npmrc` |
| Revisão de interface (diretrizes da Vercel) | 5 correções de acessibilidade aplicadas |
| Revisões cruzadas e final | base, núcleo (log, cofre, identidade, origem, regras): revisão cruzada aprovada e tech-lead. Branch integrada, em 30/10: revisão de segurança (APPROVE_WITH_NOTES, correções aplicadas); revisão cruzada do Codex com risco alto pediu 4 correções (origem por unidade quando a mesma pessoa fala com duas unidades, conferência de pessoa, curso e unidade antes de a venda ganhar, encaminhamento quando a triagem ganha intenção, reenvio do aviso de pagamento do ERP), feitas com teste e aprovadas na 2ª rodada; tech-lead: APPROVE_WITH_NOTES, e os 3 pontos importantes (o "Recomeçar" não zerava o ERP, as horas de 30/10 fora deste registro, uma origem prometida no README que aquele caminho não produz) corrigidos e revisados. Guia da demo, em 30/10: revisão cruzada do Codex (1 correção, aprovada na 2ª rodada) e tech-lead (2 rodadas, 6 correções com teste, entre elas "tive uma intercorrência", que recebia oferta de curso). Documento v3: meu parecer (88/100) e o do Codex (82/100) juntos em 16 ajustes, revisão do Codex aprovada, 5 páginas |
| Bug achado na revisão | `/api/replay` falhava com o banco em arquivo (modo WAL); corrigido com teste que abre o banco real |

## Pendências e o que ficou de fora

1. **Achados menores declarados:** se o core recusar para sempre o aviso de pagamento, o ERP tenta de novo a cada segundo, sem limite (não duplica a venda; em produção, espera crescente e fila de erro); os atalhos do produto para o ERP e o celular usam as portas padrão 3100 e 3200; um "sim" a uma oferta que também pergunta a origem confirma a oferta e deixa a pergunta de origem para depois.
2. **Celular simulado no formato da API oficial:** o canal proposto é a API oficial da Meta, e o adaptador dela tem testes de contrato; o celular da demo fala o protocolo do WAHA. Trocar o simulador para o formato da Meta foi avaliado (3 a 5 horas) e ficou de fora por tempo.
3. **Fora da demo, descrito no documento:** troca de número no WhatsApp, entrada de vendas da Hotmart, consentimento por finalidade, envio a RD, Meta e Google com filtro pela classe do dado, apagamento definitivo de pessoa (com chave por pessoa), confirmação da conciliação em um clique, tela de fusão de fichas, busca da campanha pelo gclid, modelo de IA real.
4. **Limites da demo, declarados no README:** sem autenticação nas rotas; o cabeçalho `x-occurred-at` deixa a simulação escolher o horário; `/tools` confia no `x-actor`; segredos de demonstração; com a chave HMAC do WAHA vazia, qualquer corpo é aceito; o webhook espera a reação da IA (em produção, gravar, responder 200 e reagir por fila); um único `META_PHONE_NUMBER_ID`.
5. **Exceções de dependência:** class-variance-authority 0.7.1 (exigida pelos componentes do shadcn, sem versão estável publicada); 3 alertas baixos do `npm audit` dentro da ferramenta de linha de comando do shadcn, fora do código servido.
6. **Produto:** telas abaixo de 1280 px não foram adaptadas; a ficha do CRM não prende o foco do teclado; a seleção não vai para a URL.
7. **`verify`:** prova o núcleo com o cliente local do ERP; cada ligação HTTP entre os serviços tem teste próprio (`test/services.test.ts`, `test/erp-notification.test.ts`); o circuito inteiro, com os três juntos, está provado na demo ao vivo.
8. **Cofre:** o texto das mensagens é guardado por valor; duas pessoas com a mesma mensagem dividem a mesma linha (em produção, chave por pessoa).
