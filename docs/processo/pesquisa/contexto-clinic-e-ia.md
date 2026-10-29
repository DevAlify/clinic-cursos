# Contexto público da Clinic, ferramentas atuais e IA (consulta em 28/10/2026)

Só páginas públicas; tags, scripts e UTMs do site NÃO foram inspecionados (o enunciado proíbe executar a auditoria real).
† = trecho de busca; openai.com e help.openai.com bloquearam leitura direta (403): reconferir antes de citar.

## 1. Clinic Cursos
- Escola de harmonização facial e corporal, desde 2018 (Clinic Cursos de Estética LTDA). https://www.cliniccursos.com.br/sobre
- Cursos livres presenciais: facial, corporal (glútea, escleroterapia), íntima, pele/capilar, equipamentos. https://www.cliniccursos.com.br/cursos
- Harmonização Facial: 16 h em 2 dias, prática com pacientes modelos, turma de até 10, preço só por formulário. https://www.cliniccursos.com.br/curso-harmonizacao-facial
- Outros formatos: pós de 12 meses/500 h ("Registro no MEC", instituição não citada) https://www.cliniccursos.com.br/pos-graduacao ; Residência intensiva, 64 h em 4 meses https://www.cliniccursos.com.br/residencia ; MBA Gestão em EAD gravado https://www.cliniccursos.com.br/mba-gestao-clinic-cursos . "Imersão" não aparece.
- Unidades: São Paulo (Av. Paulista, Bela Vista), Campinas (Guanabara), Rio (Botafogo). https://www.cliniccursos.com.br/contato
- Paciente Modelo: alunos fazem os procedimentos, professores acompanham, a pessoa "paga apenas o custo do produto"; tabela de preços em imagem; "Inscreva-se" leva a botões de WhatsApp, sem formulário. https://www.cliniccursos.com.br/modelos
  - Escala diverge entre páginas: "+30.000 atendidas" (home), ">400/mês" (pós), ">700/mês" (residência).
  - Inferência: fluxo público manual; triagem, agenda e consentimento não aparecem.
- Digitais: Clinic Plus (vídeos por assinatura, R$ 29,90/mês) https://www.cliniccursos.com.br/clinicplus ; Cursos Online (Intercorrências, Prescrição Estética, Avaliação Facial) com checkout em pay.hotmart.com https://www.cliniccursos.com.br/intercorrencias
- Tipos de canal divulgados: WhatsApp (principal), formulário, e-mail por unidade, telefone, Instagram, TikTok, YouTube, Facebook, blog.

## 2. Ozia e Aktos
- Ozia: plataforma omnichannel de atendimento (WhatsApp, Instagram, Telegram, Messenger) com chatbots e multiagente https://ozia.io ; no RD Station: "atendimento híbrido" com agentes de IA, conexão a CRM/ERP/APIs e integração com RD Station Marketing https://www.rdstation.com/integracoes/ozia/
- Preço não público (teste de 3 dias; "multiusuários" é Premium) https://ozia.io/premium
- Aktos como produto de atendimento: NÃO encontrado. Homônimos sem relação comprovada: aktos.ai (cobrança com IA), aktos.com.br (consultoria). Vira pergunta para a equipe.

## 3. Chat x API x integrações
### (a) App de chat não serve de backend
- Assinatura e API são produtos, contas e cobranças separados: https://support.claude.com/en/articles/9876003 ; † https://help.openai.com/en/articles/9039756
- Termos de consumidor vedam automação: Anthropic https://www.anthropic.com/legal/consumer-terms ; OpenAI † https://openai.com/policies/row-terms-of-use/
- Chats de consumidor podem treinar modelos conforme configuração: https://www.anthropic.com/news/updates-to-our-consumer-terms ; † OpenAI.
### (b) APIs
- Anthropic: não treina com dados de API por padrão https://privacy.claude.com/en/articles/7996868 ; retenção e ZDR (só por contrato; alguns modelos exigem 30 dias) https://platform.claude.com/docs/en/manage-claude/api-and-data-retention (há divergência na página: confirmar no contrato).
- OpenAI: API não treina por padrão; logs de abuso até 30 dias; ZDR com aprovação https://developers.openai.com/api/docs/guides/your-data
- Risco de provedor: OpenAI encerrou a Assistants API em 26/08/2026 https://developers.openai.com/api/docs/assistants/migration ; Anthropic avisa 60+ dias antes de aposentar modelos https://platform.claude.com/docs/en/about-claude/model-deprecations (o agente relatou remoção de temperature/top_p/top_k na versão 2026-10-21: CONFERIR antes de citar).
### (c) Integrações
- MCP: padrão aberto, especificação atual 2026-07-28 https://modelcontextprotocol.io/specification/versioning ; sob a Linux Foundation (AAIF) desde 09/12/2025 https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation
- Claude Agent SDK (Python/TS), só modelos Claude https://code.claude.com/docs/en/agent-sdk/overview
- OpenAI Agents SDK (Python/TS), outros provedores via endpoint compatível https://openai.github.io/openai-agents-js/
- Inferência do agente: manter histórico e ferramentas (MCP) do nosso lado, camada fina sobre o modelo, ZDR conferido por modelo; dados de pacientes pedem DPA e retenção revisados.
