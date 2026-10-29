# Fatos oficiais de rastreamento, WhatsApp, anúncios, Hotmart, RD e LGPD (consulta em 28/10/2026)

[Inf.] = inferência do pesquisador, não texto de fonte.

## 1. WhatsApp Cloud API
- Mensagem recebida: `object` > `entry[].changes[]` (`field:"messages"`) > `value{metadata, contacts[{profile.name, wa_id}], messages[{from, id=wamid, timestamp (string Unix), type, text.body}]}`. https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text
- Repetição: "These retries can result in duplicate webhook notifications"; deduplicar é responsabilidade do nosso servidor. Não há API de histórico: guardar o payload bruto. Envios geram `statuses[]` (sent, delivered, read). https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint [Inf.] chave: wamid (entrada) e wamid+status (status).
- BSUID: desde abr/2026 os webhooks trazem `contacts[].user_id` e `messages[].from_user_id`. Se o usuário adotar nome de usuário, `wa_id`/`from` (telefone) podem faltar. Suporte exigido também de anunciantes CTWA. https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids
- `messages[].referral` ("only included if message sent via a Click to WhatsApp ad"): `source_url`, `source_id` (id do anúncio), `source_type` ("ad"), `body`, `headline`, `media_type`, `image_url`, `video_url`, `thumbnail_url`, `ctwa_clid` (omitido em anúncios do Status), `welcome_message.text`. Mesma página.
- Falha (resposta diferente de 200): reenvio imediato e depois com frequência decrescente por até 7 dias; depois descarta. Assinatura: `X-Hub-Signature-256: sha256=<HMAC-SHA256 do corpo com o app secret>`. https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
- Janela de 24 h: abre quando o usuário escreve e reinicia a cada mensagem; fora dela, só template aprovado (marketing, utility, authentication); contato ativo exige opt-in. https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows · https://business.whatsapp.com/policy
- Preço: por mensagem entregue, por categoria × país; usuário→empresa não cobra. Desde 01/10/2026: 1.000 mensagens de serviço grátis/mês por número, e utility dentro da janela passou a ser cobrado. Anúncio CTWA: a 1ª resposta abre janela gratuita de até 7 dias. https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- IA: Termos §4.7 "AI Providers" (alterado em 23/09/2026) proíbem provedores de IA quando a IA é a funcionalidade "primary (rather than incidental or ancillary)"; dados da plataforma não podem treinar modelos (exceto ajuste fino de uso exclusivo). https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform · vigência 15/01/2026; Brasil na lista de exceção, com cobrança desde 11/03/2026: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers . Permitido: automação na janela de 24 h com escalonamento para humano; mensagens de serviço podem ser "powered by a 3rd-party AI solution or people" (business.whatsapp.com/policy). [Inf.] bot da própria clínica não é "AI Provider"; validar com jurídico.
- wa.me: `https://wa.me/<numero_internacional>?text=<texto_urlencoded>`, número sem "+", zeros, traços. https://faq.whatsapp.com/5913398998672934 [Inf.] wa.me não gera `referral`; o rastreio vai só no texto pré-preenchido, que a pessoa pode apagar.
- Graph API atual: v26.0 (29/07/2026). https://developers.facebook.com/docs/graph-api/changelog/

## 2. Meta Ads
- `fbclid` na URL (não alterar). `_fbc` = `fb.{idx}.{ms}.{fbclid}`; `_fbp` = `fb.{idx}.{ms}.{aleatório}`; guardar `_fbc` por 90 dias. https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/fbp-and-fbc
- CAPI web: `action_source:"website"`, `event_source_url`, `client_user_agent`, `fbc`, `fbp`; `event_time` até 7 dias; `event_id`+`event_name` deduplicam com o Pixel. https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/server-event
- CTWA: `action_source:"business_messaging"`, `messaging_channel:"whatsapp"`, `user_data.whatsapp_business_account_id` + `user_data.ctwa_clid`; eventos Purchase, LeadSubmitted, QualifiedLead. Sem `ctwa_clid`: `em`/`ph` com hash + `page_id`, atribuição até 7 dias. https://developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging (guia escrito para parceiros; uso em integração própria não confirmado)
- "Conversions API for CRM integration" / "Leads qualificados": só para Lead Ads (formulário instantâneo). https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration
- Hash SHA-256 após normalizar (`em` minúsculo; `ph` só dígitos com 55). Sem hash: `fbc`, `fbp`, `ctwa_clid`, `lead_id`. https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters
- Termos das Business Tools §1.h (vigência 03/11/2025): proibido enviar dados de saúde ou outras categorias sensíveis; nomes de eventos não podem refleti-los. https://www.facebook.com/legal/terms/businesstools

## 3. Google
- gclid = id do clique (auto-tagging) https://support.google.com/google-ads/answer/9744275 ; gbraid/wbraid (iOS) https://developers.google.com/google-ads/api/docs/conversions/upload-offline ; não remover `gad_source`/`gad_campaignid` https://support.google.com/analytics/answer/16479993
- "Conversões otimizadas para leads" = importação offline com GCLID + e-mail/telefone com hash. Desde 15/06/2026 o upload offline migrou para a Data Manager API. https://support.google.com/google-ads/answer/2998031 · https://developers.google.com/data-manager/api/devguides/events
- UTMs GA4: obrigatórios `utm_source`, `utm_medium`, `utm_campaign`; recomendados `utm_id`, `utm_source_platform`; também `utm_term`, `utm_content`, `utm_creative_format`, `utm_marketing_tactic`; valores sensíveis a maiúsculas. https://support.google.com/analytics/answer/10917952
- PII: "Both the URL path and parameters must be free of PII". https://support.google.com/analytics/answer/6366371
- Recuperar campanha pelo gclid (consulta em 29/10/2026): o recurso `click_view` da Google Ads API aceita filtro por `click_view.gclid`, exige filtro de um único dia (`segments.date`) e alcança até 90 dias atrás. https://developers.google.com/google-ads/api/fields/v25/click_view (um relato de 2022 cita retorno vazio nessa consulta; testar antes de prometer).

## 4. Hotmart
- Links: `sck` (checkout) e `src` (página de vendas); até 30 caracteres; underscore PROIBIDO. https://help.hotmart.com/en/article/how-can-i-found-out-the-origins-of-my-sales-/216441797
- Webhook 2.0.0: `purchase.origin.src`, `.sck`, `.xcod`; `purchase.transaction`; `id` do evento; eventos PURCHASE_APPROVED, COMPLETE, CANCELED, REFUNDED, CHARGEBACK; header `X-HOTMART-HOTTOK`. https://developers.hotmart.com/docs/en/2.0.0/webhook/purchase-webhook/
- Reenvio até 5 vezes; histórico de 60 dias. https://help.hotmart.com/en/article/360001491352/

## 5. RD Station Marketing
- Entrada: `POST https://api.rd.services/platform/events?event_type=conversion` (`conversion_identifier`, `email|phone`, `traffic_source/medium/campaign/value`, `legal_bases`, `cf_*`); venda: `event_type=sale`. https://developers.rdstation.com/reference/evento-de-convers%C3%A3o-padr%C3%A3o
- Saída: webhooks `WEBHOOK.CONVERTED` e `WEBHOOK.MARKED_OPPORTUNITY`; origem só em `funnel.origin` (utm_medium e utm_source, sem campanha). Reenvio: 3 tentativas, timeout de 5 s. https://developers.rdstation.com/reference/webhooks-payload-mkt · https://developers.rdstation.com/reference/retries-logic

## 6. LGPD (Lei 13.709/2018)
- Marketing: consentimento (art. 7º, I; art. 5º, XII; art. 8º, §4º veda autorização genérica) ou legítimo interesse (art. 7º, IX; art. 10). https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- Saúde = dado sensível (art. 5º, II); art. 11: consentimento específico e destacado ou hipóteses do inciso II; legítimo interesse não se aplica; §4º veda compartilhar dado de saúde para vantagem econômica. [Inf.] dados clínicos de pacientes modelos fora do pipeline de marketing.
- Art. 6º (necessidade); art. 18 (acesso, correção, eliminação, portabilidade, revogação); art. 19 (15 dias). [Inf.] art. 33 (transferência internacional) ao enviar a Meta/Google.
- ANPD: guia de Legítimo Interesse (fev/2024), não aplicável a dado sensível; guia de Cookies (out/2022), para publicidade o legítimo interesse "dificilmente será a hipótese legal mais apropriada". https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/

## Exemplo de webhook com referral (dados fictícios)
```json
{
  "object": "whatsapp_business_account",
  "entry": [{ "id": "<WABA_ID>", "changes": [{ "field": "messages", "value": {
    "messaging_product": "whatsapp",
    "metadata": { "display_phone_number": "<NUMERO_EMPRESA>", "phone_number_id": "<PHONE_NUMBER_ID>" },
    "contacts": [{ "profile": { "name": "Lead Teste" }, "wa_id": "5511900000001", "user_id": "BR.1234567890123456789" }],
    "messages": [{
      "from": "5511900000001", "from_user_id": "BR.1234567890123456789",
      "id": "wamid.HBgL...EXEMPLO=", "timestamp": "1749416383", "type": "text",
      "text": { "body": "Vi o anúncio e quero saber mais sobre o curso" },
      "referral": {
        "source_url": "https://fb.me/3cr4Wqqkv", "source_id": "120226305854810726", "source_type": "ad",
        "headline": "Fale com a gente", "media_type": "image",
        "ctwa_clid": "Aff-n8ZTODiE79d22KtAw..."
      }
    }]
  }}]}]
}
```

## Não encontrado ou incerto
- Intervalos exatos de reenvio (Meta: "frequência decrescente, até 7 dias"; Hotmart: "até cinco vezes"); se o `id` da Hotmart se repete no reenvio.
- Se `referral` vem só na 1ª mensagem; `source_type` aparece como "ad" e como "ad or post".
- Hotmart: exemplo JSON oficial não obtido; UTMs não constam do webhook.
- Enquadramento de cursos de estética na política de saúde do WhatsApp: não encontrado (decisão jurídica).
- LGPD: sem definição oficial de que procedimento estético seja dado de saúde.

## 7. Identidade no WhatsApp (consulta em 29/10/2026)
- Mensagens de sistema: `system.type: "user_changed_number"` ("the user changed their phone number and the new number can be shared with you"), com `wa_id` novo, `user_id` (BSUID atual) e `previous_user_id` (BSUID anterior); `wa_id` e `from` somem se o usuário usa nome de usuário. A página repete: "A WhatsApp user's ID and phone number may not match." https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/system
- Nono dígito no Brasil: contas antigas podem ter `wa_id` sem o 9. Documentado por provedores, sem página específica da Meta: https://support.gupshup.io/hc/en-us/articles/4407840924953 · https://waha.devlike.pro/docs/apps/brazilian-phone-numbers/ [Inf.] normalizar celular BR para 9 dígitos ao casar e guardar o valor bruto.
- 360dialog recomenda casar primeiro pelo BSUID e depois pelo telefone (trecho de busca, página não aberta): https://docs.360dialog.com/docs/inbox/inbox-api/contacts
