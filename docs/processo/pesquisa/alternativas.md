# Alternativas open source: Chatwoot x Twenty x construir do zero (consulta em 28/10/2026)

(inf.) = inferência do pesquisador; (op.) = opinião. Fontes no fim.

Resumo: só o Chatwoot tem canal WhatsApp Cloud nativo e já guarda o referral de anúncios; o Twenty não tem canal WhatsApp (está no roadmap). Nenhuma das duas resolve identidade única entre canais nem origem só de acréscimo.

## Triagem (ficaram fora)
- Frappe CRM (AGPL-3.0): WhatsApp só por app comunitário (MIT, mantenedor individual), sem fila nem referral [X1].
- Odoo Community (LGPL-3.0): WhatsApp só no Enterprise [X2].
- Krayin (MIT): WhatsApp só por extensão paga, US$ 1.499 [X3].
- EspoCRM, SuiteCRM (AGPL-3.0): sem integração oficial; só extensões de terceiros [X4].
- Zammad (AGPL-3.0): Cloud API oficial, mas sem templates nem conversa iniciada pela empresa [X5].

## Comparação
| Item | Chatwoot | Twenty | Construir do zero (inf.) |
|---|---|---|---|
| Repo, docs, versão | github.com/chatwoot/chatwoot; developers.chatwoot.com. v4.19.1 (24/10/2026); minor mensal + patches [C1][C4] | github.com/twentyhq/twenty; docs.twenty.com. v2.52.0 (27/10/2026); ~2 minors/semana desde a v2.0.0 (21/04/2026), com breaking changes [T1] | Sem cadência externa |
| Licença | MIT, exceto `enterprise/` (proprietária: produção só com assinatura). Uso interno, alteração e fork livres no MIT [C2][C3] | AGPL-3.0; MIT em pacotes (SDK, UI, apps); arquivos `@license Enterprise` exigem contrato. Alterado e acessado em rede, AGPL §13 pede oferecer o fonte (inf.) [T2] | Código da Clinic |
| WhatsApp Cloud API e origem de anúncio | Nativo: manual (Phone Number ID, WABA ID, token) ou Embedded Signup; 1 inbox por número; sem coexistência com o app WhatsApp Business no fluxo manual [C7]. Referral: v4.19.1 grava o objeto inteiro em `content_attributes.referral`, exposto no webhook `message_created` e na API de mensagens [C8]; card do anúncio desde a v4.17.0 [C4]. Trata BSUID [C13] | Não nativo; WhatsApp "provavelmente perto do núcleo", sem data. App de canal (beta) só responde a threads existentes, sem iniciar conversa (logo sem template) (inf.). Referral: sem suporte [T6] | Webhook assinado, idempotência, janela de 24h, templates, mídia, BSUID; referral como evento só de acréscimo |
| API e webhooks | REST (contato com `identifier` = ID externo, conversas, mensagens, atributos, bots); webhooks HMAC; limite de taxa não encontrado [C9][C14] | REST e GraphQL gerados do esquema, OAuth, 100 req/min; webhooks HMAC; retry não documentado [T5] | Contratos próprios |
| Agentes de IA | Agent Bot grátis: conversa nasce `pending`, bot responde pela API e passa ao humano com `open`. Captain é pago. MCP oficial não encontrado [C10][C5] | Agentes em workflows, chaves próprias de LLM, MCP oficial em `/mcp` [T7][T5] | Pequeno |
| Hospedagem | Rails + Sidekiq + Postgres (pgvector) + Redis; mín. 2 vCPU/4 GB; ping ao hub da Chatwoot [C6][C16] | server + worker + Postgres 16 + Redis; mín. 2 GB [T4] | App + Postgres + fila |
| Custo self-hosted | Community US$ 0; Premium US$ 19; Enterprise US$ 99 por agente/mês [C5] | Núcleo grátis; SSO, permissão por linha e auditoria pedem chave Organization (preço não encontrado) [T3] | Horas de desenvolvimento |
| Saída | Postgres direto (pg_dump), API, CSV de contatos; fork MIT [C11] | pg_dump, API, CSV por visão (20 mil registros) [T4][T8] | Sem aprisionamento |
| pt-BR | `pt_BR` habilitado [C12] | `pt-BR.po` presente [T9] | Nativo |
| Esforço e risco (inf.) | Sobe em dias; o fornecedor não suporta código customizado [C11] | CRM em dias; WhatsApp = app de canal em beta | 1 pessoa: identidade e origem em semanas; funil v1 em 1-2 meses; caixa de WhatsApp v1 em 2-3 meses. Risco: bordas do WhatsApp e dependência de uma pessoa |

## Lacunas e riscos
1. Nenhuma das duas dá ID único entre canais nem histórico de origem só de acréscimo. No Chatwoot o referral fica em JSON mutável na mensagem; `ctwa_clid` pode faltar (a Meta o omite em anúncios de Status) [M1]; o merge de contatos é irreversível [C14]; BSUID pode omitir o telefone [M2]. O núcleo próprio deve ser o dono (`identifier` = id da pessoa) (inf.).
2. O Twenty não atende WhatsApp hoje: sem disparo ativo nem fila de atendimento [T6].
3. Open-core: o Chatwoot cobra papéis, SSO, SLA, Captain, auditoria e rastreio de campanhas [C5][C4]; o Twenty cobra permissão por linha, SSO e auditoria [T3]. Isolar por unidade no Chatwoot é grátis, por membros de inbox [C15].
4. Pessoa aluna, paciente e lead: contato do Chatwoot só tem atributos simples, sem relações (inf.) [C14]; o Twenty modela oportunidade por produto e unidade [T10], mas o ERP é a fonte de verdade: risco de dupla verdade (inf.).

## Recomendação do pesquisador (op.)
Chatwoot como caixa de atendimento (MIT, sem `enterprise/`), ligado por webhooks e API a um núcleo próprio com identidade, origem só de acréscimo e vínculo com o ERP. Twenty opcional, mais tarde, como visão de funil. A Clinic mantém código (fork MIT), dados (Postgres próprio), servidor e a fonte de verdade da pessoa e da origem.

## Notas de verificação
- Chatwoot: GitHub marca NOASSERTION por causa do `enterprise/`; o LICENSE raiz é MIT (Expat). Referral confirmado no código da v4.19.1 e nas notas da v4.17.0. O PR #14121 (referral também na conversa) foi fechado sem merge.
- Twenty: o feed já mostra v2.53.0/v2.53.1 de 28/10, mas a API "latest" aponta v2.52.0.
- Não encontrados: limite de taxa da API do Chatwoot; MCP oficial do Chatwoot; preço self-hosted da chave Organization do Twenty; completude do pt-BR; custo de VM.
- Estimativas "do zero" e leitura do AGPL §13 são inferências, sem parecer jurídico.
- CONFERIR com a pesquisa de fatos oficiais: o pesquisador citou "franquia de 1.000 mensagens de serviço por mês por número" na página de preços da Meta, o que parece o modelo antigo. Não citar sem confirmar.

## Fontes (todas consultadas em 28/10/2026)
C1 https://github.com/chatwoot/chatwoot · https://api.github.com/repos/chatwoot/chatwoot/releases/latest
C2 https://raw.githubusercontent.com/chatwoot/chatwoot/develop/LICENSE
C3 https://raw.githubusercontent.com/chatwoot/chatwoot/develop/enterprise/LICENSE
C4 https://api.github.com/repos/chatwoot/chatwoot/releases/tags/v4.17.0
C5 https://www.chatwoot.com/pricing/self-hosted-plans
C6 https://developers.chatwoot.com/self-hosted/ · https://raw.githubusercontent.com/chatwoot/chatwoot/develop/docker-compose.production.yaml
C7 https://www.chatwoot.com/hc/user-guide/articles/1756799850-how-to-setup-a-whats_app-channel-manual-flow · https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup
C8 https://raw.githubusercontent.com/chatwoot/chatwoot/v4.19.1/app/services/whatsapp/incoming_message_service_helpers.rb · .../app/models/message.rb · .../app/listeners/webhook_listener.rb · https://developers.chatwoot.com/api-reference/messages/get-messages.md
C9 https://developers.chatwoot.com/api-reference/webhooks/add-a-webhook.md
C10 https://www.chatwoot.com/hc/user-guide/articles/1677497472-how-to-use-agent-bots
C11 https://developers.chatwoot.com/self-hosted/deployment/backup.md · https://www.chatwoot.com/blog/v2-18
C12 https://raw.githubusercontent.com/chatwoot/chatwoot/develop/config/initializers/languages.rb
C13 https://raw.githubusercontent.com/chatwoot/chatwoot/v4.19.1/app/services/whatsapp/user_id_rotation_service.rb
C14 https://developers.chatwoot.com/api-reference/introduction · .../contacts/merge-contacts.md · .../custom-attributes/add-a-new-custom-attribute.md
C15 https://www.chatwoot.com/hc/user-guide/articles/1677482414-adding-agents
C16 https://raw.githubusercontent.com/chatwoot/chatwoot/v4.19.1/lib/chatwoot_hub.rb
T1 https://github.com/twentyhq/twenty · https://api.github.com/repos/twentyhq/twenty/releases/latest · https://github.com/twentyhq/twenty/releases.atom
T2 https://raw.githubusercontent.com/twentyhq/twenty/main/LICENSE
T3 https://twenty.com/pricing · https://docs.twenty.com/user-guide/billing/capabilities/pricing-plans.md
T4 https://docs.twenty.com/developers/self-host/capabilities/docker-compose.md
T5 https://docs.twenty.com/developers/extend/api.md · .../webhooks.md · .../mcp
T6 https://docs.twenty.com/developers/extend/apps/logic/messaging-channels.md · https://github.com/twentyhq/twenty/discussions/16735
T7 https://docs.twenty.com/user-guide/ai/how-tos/ai-faq.md
T8 https://docs.twenty.com/user-guide/data-migration/how-tos/export-your-data.md
T9 https://api.github.com/repos/twentyhq/twenty/contents/packages/twenty-front/src/locales
T10 https://docs.twenty.com/getting-started/core-concepts/data-model.md
M1 https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text
M2 https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids
M3 https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
X1 https://docs.frappe.io/crm/whatsapp.md · https://github.com/shridarpatil/frappe_whatsapp
X2 https://www.odoo.com/documentation/19.0/applications/productivity/whatsapp.html
X3 https://krayincrm.com/extensions/krayin-crm-whatsapp-extension/
X4 https://store.suitecrm.com/docs/suite-whatsapp-integration/introduction
X5 https://admin-docs.zammad.org/en/latest/channels/whatsapp/limitations.html
