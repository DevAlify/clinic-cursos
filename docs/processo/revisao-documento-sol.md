# Parecer independente sobre a entrega Clinic Cursos

Data: 30/10/2026. Avaliação da entrega, não da operação real da Clinic.

## Método e limites

Fontes: `desafio.txt`, `documento.txt` e `registro.md` da pasta temporária `scratchpad/doc-review` indicada no cartão; `docs/documento.html`, `README.md` e código desta revisão. Nas referências abaixo, D1 a D5 significam as cinco seções numeradas do documento submetido; C1 a C6, as páginas do desafio. As citações do desafio foram lidas como Windows-1252 para preservar os acentos.

A Parte 1 foi escrita no arquivo antes da Parte 2, a partir do cruzamento entre desafio, documento e repositório. Ressalva de independência: as propostas da Parte 2 vieram na mesma mensagem da tarefa e já estavam visíveis ao avaliador. Não seria correto declarar uma avaliação cega. As notas abaixo são meu julgamento, não uma previsão estatística da banca. Os ganhos sugeridos são marginais, aproximados e se sobrepõem; não devem ser somados.

TDD foi consultado, mas não há implementação nem alteração de comportamento nesta tarefa. A verificação aplicável é a estrutura do parecer, a conferência das referências e a restrição do diff ao arquivo permitido. Não fiz auditoria dos sistemas da empresa nem revalidei na internet versões, preços, licenças ou políticas citadas pelo candidato.

## Parte 1: avaliação da entrega

### Nota pela rubrica

| Critério | Pontos | Razão |
|---|---:|---|
| Rastreamento e qualidade dos dados | 25/30 | D2 traz inventário, padrão, quatro correções e níveis de prova; D3 deixa ambíguos o denominador da cobertura e a conciliação entre eventos de naturezas diferentes. |
| Entendimento da operação e priorização | 16/20 | D1 pergunta por operação, acessos e pacientes; D3 prioriza rastreamento, mas não distribui as horas do profissional e deixa a migração de pacientes dependente de P7. |
| Arquitetura e integrações | 12/15 | D4 separa donos e preserva eventos; faltam fronteiras mais claras entre desenho e demo, tratamento operacional da quarentena e limites das permissões simuladas. |
| Demonstração técnica | 18/20 | README, “O que cada cenário prova”, cobre os cinco cenários e a falha pedida; o celular integrado usa WAHA, e o próprio README, “Limites desta demo”, delimita autenticação e dados fictícios. |
| Pesquisa e escolhas | 8/10 | D4 compara Chatwoot, Twenty e construção própria com fontes e datas; “US$ 0” e “Só horas” não explicitam o custo total, e a comparação mistura caixa de atendimento com CRM. |
| Comunicação e transparência | 3/5 | D1 declara o excesso das quatro horas e as simulações, mas há ambiguidades em D3 e D4 e formulações absolutas em D2 e D5 que excedem a prova apresentada. |
| **Total** | **82/100** | Entrega forte para discutir em banca, com maior retorno em precisão e recorte operacional do que em acrescentar funcionalidades. |

### Requisitos ausentes ou respondidos de forma fraca

Não considero ausentes itens que o documento efetivamente entrega: oito perguntas com evidência e decisão (D1), matriz de quatro entradas digitais e físicas (D2), sete critérios de piloto e três horizontes (D3), duas alternativas e construção própria (D4), IA e Grande Cérebro dentro da quinta página (D5). A lista abaixo reúne as lacunas encontradas, inclusive respostas parciais.

| Exigência literal do desafio | Onde a resposta enfraquece | Complemento necessário |
|---|---|---|
| C3: “Google Ads, Analytics, Meta Ads” | D2 lista contas de anúncio e GTM, mas não nomeia a auditoria da propriedade do Analytics. | Incluir propriedade/fluxo do GA4, evento de conversão e confronto de contagens. GTM instalado não comprova evento recebido no Analytics. |
| C3: “Inclua contatos diretos, orgânicos e indicações.” | D2, Preservação, agrupa os três como sem link rastreável. | Orgânico pode chegar por um link identificado. Distinguir entrada rastreada da entrada sem prova; não transformar todo orgânico em declaração. |
| C3: “Como trataria múltiplos contatos, troca de dispositivo, retorno direto” | D2 diz que trocar dispositivo não muda a ficha; D4 explica igualdade exata. | Condicionar a reunião à apresentação de identificador comum. Sem ele, não há prova suficiente. `src/core/identity.ts:21` procura correspondência exata, não reconhece dispositivos anonimamente. |
| C3: “testes ponta a ponta, conciliação de volumes” | D2 descreve teste do clique ao registro; D3 fala em clique até ficha. A matriz do QR pede que leituras batam com mensagens. | Levar o teste até venda confirmada no ERP. Separar leitura, mensagem, pessoa, oportunidade e venda; leitura de QR não implica envio de mensagem. |
| C3: “Proponha limites, amostra e período de observação; justifique-os.” | D3 pede 95% de todos os leads com campanha observada e reconhece que WhatsApp direto nunca terá essa prova. | Definir denominador elegível por ponto e manter desconhecidos no total geral, sem excluí-los do diagnóstico. |
| C3: “Proponha limites, amostra e período de observação; justifique-os.” | D3 usa 60 leads seguidos e regra de três, sem indicar distribuição por canal, unidade ou condição de independência. | A conclusão de aproximadamente 5% é condicionada à amostra representativa e aos erros independentes. Não garante cada canal. Distribuir a amostra entre pontos do piloto. |
| C3: “conciliação de volumes” e “evidência esperada de validação” | D3 fixa diferença de 5% entre plataformas e núcleo; D2 exige igualdade QR/mensagem. | Especificar mesma janela/fuso, evento comparável e explicação de divergências por consentimento, abandono ou duplicação. A meta não pode equiparar clique e lead. |
| C4: “Como lidar com repetição, atraso e falha de eventos, permissões, auditoria e manutenção.” | D4 nomeia chave, horário e quarentena, mas não quem resolve, prazo, reprocessamento nem política de tentativa. | Dizer quem revisa a fila e como repete sem duplicar. Na demo `src/core/apply.ts:9` registra quarentena; `src/core/http.ts:3` define 5 s e nenhuma repetição automática. Isso não constitui operação completa de recuperação. |
| C4: “Mostre dependências e capacidade disponível; não presuma equipes que não existem.” | D3 apresenta ~80 h, ~80 h e ~360 h, sem dizer se são incrementais e sem repartir auditoria, correção e núcleo. | Explicitar intervalos, orçamento por atividade e o que sai quando acessos atrasam. D1 pede apoios pontuais; não tratá-los como equipe de execução garantida. |
| C5: “Para cada fase, apresente [...] responsável” | D3 tem um responsável geral, mas as fases de 30 e 90 dias não distinguem execução de validação. | Nomear o profissional como executor, coordenação como validadora e fundador como decisor de liberação. Não contratar equipe por implicação. |
| C2: “a integração do histórico de pacientes ainda precisa ser resolvida.” C5: “Inclua migração gradual [...] histórico incompleto” | D1 P7 investiga; D3 trata importação genérica; D4 deixa pacientes em P7. | Definir descoberta do legado, lote piloto, conferência de identidade e restrição de acesso, sem enviar dado clínico ao marketing. A dependência está reconhecida, a entrega de migração ainda não está delimitada. |
| C5: “continuidade do atendimento e possibilidade de recuar se a transição falhar.” | D3 mantém fornecedor e prevê retorno, mas não diz como evitar conversa perdida ou resposta dupla no corte. | Exigir uma caixa responsável por vez e conciliar conversas abertas antes da troca e do recuo; citar o acionador do rollback. |
| C4: “Compare adequação [...] lacunas, custos, hospedagem, manutenção e possibilidade de migração.” | D4 compara atendimento com CRM, informa recursos de máquina e licença grátis, mas não estima infraestrutura e manutenção em horas nem custo do canal. | Explicitar que são componentes diferentes; zero licença não significa zero operação. Usar custo a cotar e esforço próprio estimado, sem inventar preço. |
| C2: “Atendimento próprio: WhatsApp oficial da Meta” | D4 coloca “Meta (oficial) ou WAHA” junto da porta 3200; não explica que o celular integrado é um simulador do protocolo alternativo. | Distinguir canal oficial recomendado, adaptador implementado e protocolo exercitado. README, “Provedor de WhatsApp”, já faz essa distinção. |
| C2: “Agente de tráfego: relacionar campanhas, investimento, leads, vendas reais e capacidade de turmas.” | D5 só cita investimento como insumo futuro; não aponta a tela já entregue. | Dizer o que Campanhas já relaciona e que os valores da prova são fictícios. `web/src/components/campanhas/CampanhasView.tsx:22` contém essas colunas; `src/server.ts:114` liga o painel à consulta. Não equivale a integração real com contas de anúncios. |
| C6: “Como lidaria com [...] exposição de dados” | D5 afirma que nem mensagem maliciosa acessa outra pessoa, sem restringir a frase à camada do agente. | Distinguir escopo das ferramentas de segurança completa da aplicação. README, “Limites desta demo”, reconhece leituras e rotas sem autenticação. |
| C6: “Como escolheria e trocaria provedores de IA?” | D5 responde à troca, modo sombra e diferença entre chat/API/MCP, mas não define critérios comparativos de escolha. | Usar o mesmo conjunto de conversas para comparar acerto, exposição de dados, latência e custo por resolução. Vincular troca à aprovação humana. |
| C6: “Explique [...] controles e limites de atribuição necessários.” | D5 separa hipótese e número oficial, mas D3 apresenta frequência do alerta como número geral. | Condicionar “uma vez em 15 mil” à hipótese de faltas independentes e cobertura estável. Sem isso, a precisão numérica fica maior que a evidência. |
| C6: “Registro breve: tempo utilizado, IA e ferramentas usadas, fontes consultadas, verificações feitas e pendências.” C1: “Ao atingir o limite, entregue o realizado” | D1 reconhece excesso e remete ao registro. A transparência não elimina o descumprimento do recorte sugerido. | Informar critério de contabilização e excedente. O julgamento detalhado do registro fica na Parte 2; não substituir tempo por um valor conveniente. |

Também corrigiria a célula “RD (só fonte e meio, sem campanha)” de D4: o leitor não sabe se é uma limitação da ferramenta, do plano ou do dado enviado. Isso enfraquece a responsabilidade pelo dado, mesmo não sendo um entregável separado.

### Melhorias por ganho esperado por palavra acrescentada

Estimativas editoriais, não promessa de nota. Palavras são aproximações do texto substituto; o ganho é em pontos totais. Cada corte serve para manter as cinco páginas, mas o resultado precisa ser renderizado e conferido depois. O parecer não altera nem repagina o documento.

| Ordem | Alteração proposta | Palavras e ganho esperado | O que cortar ou encurtar |
|---|---|---|---|
| 1 | D3: substituir cobertura geral por cobertura dos pontos elegíveis; desconhecidos diretos aparecem separados. | ~25 palavras; +1 a +2 pontos. | Substituir a própria célula, encurtando a justificativa repetida de duas semanas. |
| 2 | D4: trocar a célula do RD por uma responsabilidade legível, sem atribuir limitação universal ao produto. | ~12 palavras; +0,5 a +1 ponto. | Remover o parêntese atual e encurtar a linha “Automação de marketing na transição”. |
| 3 | D5: apontar Campanhas como prova local de investimento, leads, vendas e vagas, com dados fictícios. | ~25 palavras; +0,5 a +1 ponto. | Substituir o item 4 do Grande Cérebro, sem criar parágrafo novo. |
| 4 | D2: acrescentar “havendo identificador comum” à troca de dispositivo; separar orgânico rastreado de sem prova. | ~20 palavras; +0,5 a +1 ponto. | Encurtar o exemplo de campanha, mantendo a convenção formal. |
| 5 | D2/D3: teste até venda e conciliação de eventos comparáveis, sem igualdade entre leitura e mensagem. | ~35 palavras; +1 a +2 pontos. | Substituir a evidência da linha QR e reduzir a “Resposta objetiva” de D2. |
| 6 | D4: explicitar canal oficial proposto, simulador usado e adaptador Meta, com o limite da prova. | ~40 palavras; +1 a +2 pontos. | Retirar a explicação de “projeções” já dada no desenho e encurtar o resumo final de D4. |
| 7 | D3: explicitar horas incrementais, distribuição mínima e corte se acessos atrasarem. | ~45 palavras; +1 a +2 pontos. | Usar o espaço do resumo final de D3, que repete os três horizontes. |
| 8 | D3: amostra por ponto e hipótese da regra de três; retirar precisão não sustentada do alerta. | ~35 palavras; +0,5 a +1 ponto. | Trocar “uma vez em 15 mil leads” pela condição de calibração no piloto. |
| 9 | D3/D4: responsável pela quarentena, caixa única no corte e conferência de conversas no recuo. | ~45 palavras; +0,5 a +1,5 ponto. | Reduzir a repetição de modo sombra entre cronograma e parágrafo de paralelismo. |
| 10 | D3: incluir um lote piloto do legado de pacientes com acesso restrito e validação da coordenação. | ~30 palavras; +0,5 a +1 ponto. | Encurtar o texto de dependências dos 90 dias; manter P7. |
| 11 | D4/D5: custo total a dimensionar e critérios mensuráveis para escolher IA. | ~45 palavras; +0,5 a +1 ponto. | Retirar a lista de seis ferramentas fora da comparação e encurtar o glossário de MIT/fork. |

Parecer: eu avançaria para a apresentação. O diferencial é a demonstração da preservação de origem e do caminho até a venda, descrita no README, “O que cada cenário prova”. A banca deve pressionar capacidade de execução e validade dos critérios, porque D3 promete quatro pontos corrigidos, núcleo em sombra e piloto em uma agenda de uma pessoa sem repartição das horas.

## Parte 2: parecer sobre as propostas existentes

### (a) Cobertura de 95% somente nas entradas rastreáveis

**Concordo, com ajuste na justificativa. Ganho esperado: +1 a +2 pontos.** O texto atual cobra canal e campanha observados de todos os leads, mas admite a impossibilidade da prova para o direto sem código (`docs/documento.html:140`). O problema é a origem anterior desconhecida, não a invisibilidade da mensagem: o sistema recebe o contato pelo WhatsApp, só não sabe como a pessoa chegou ali. Não escreveria que WhatsApp direto “nunca é observado” sem essa distinção.

Texto sugerido: “Cobertura ≥95% de canal e campanha observados nas entradas de campanha rastreáveis do piloto, por 14 dias; contatos sem prova seguem separados, com origem desconhecida ou declarada.” Antes de medir, fixar a lista de pontos elegíveis para não melhorar a nota excluindo pontos quebrados. Mostrar também o volume total e a proporção de desconhecidos. O código já separa níveis e cobertura por ponto (`src/core/state.ts:59`), mas esse painel não comprova sozinho o cumprimento do checklist de 14 dias.

Espaço: substituir a célula e encurtar sua justificativa, sem acrescentar seção; ~35 palavras no lugar do texto atual. O direto continua atendido, sem virar artificialmente campanha observada (D2, “Níveis de origem”).

### (b) Tornar explícita a frente de tráfego já demonstrada

**Concordo. Ganho esperado: +0,5 a +1 ponto.** A tabela traz campanha, leads, oportunidades ganhas, investimento, custo por lead/venda e vagas (`web/src/components/campanhas/CampanhasView.tsx:22`). As ganhas são contadas pelo status da oportunidade; as vagas vêm de `getOffer`, e o investimento é recebido pela consulta (`src/core/state.ts:172`, `src/core/state.ts:192`, `src/core/state.ts:204`). O servidor injeta investimento dos fixtures (`src/server.ts:6`, `src/server.ts:114`).

Texto sugerido: “A tela Campanhas relaciona campanha, investimento, leads, vendas confirmadas pelo ERP simulado e vagas restantes, com valores fictícios; a integração com anúncios fica para depois.” Isso evidencia a frente pedida em C2 sem prometer um agente de otimização ou vendas de produção. A capacidade mostrada é a oferta de produto/unidade consultada, não uma prova de capacidade de todas as turmas.

Espaço: substituir o item 4 do Grande Cérebro em D5 e encurtar o resumo final dessa seção; ~30 palavras. Não acrescentar captura de tela nas cinco páginas.

### (c) Esclarecer “RD (só fonte e meio, sem campanha)”

**Concordo em reescrever; mudaria o conteúdo para responsabilidade, sem concluir uma limitação do RD. Ganho esperado: +0,5 a +1 ponto.** A célula atual está na linha “Automação de marketing na transição” (`docs/documento.html:238`), mas o núcleo é apresentado como dono da origem em D4. A frase não distingue capacidade da ferramenta e contrato proposto de integração.

Texto sugerido: “RD Station: automação durante a transição; origem completa preservada no núcleo.” Se houver restrição concreta no envio ao RD, ela deve aparecer como decisão de integração, com evidência, não como incapacidade universal do produto. O registro já declara que o envio ao RD está fora da demo (`registro.md` fornecido, linha 66).

Espaço: substituir a célula, ~14 palavras, e abreviar o rótulo para “Automação na transição”. Não é necessário ampliar a comparação de ferramentas.

### (d) Data de 29/10 para 30/10

**Concordo para a data de fechamento da entrega. Ganho esperado: 0 a +0,2 ponto, por consistência.** O cabeçalho tem 29/10 (`docs/documento.html:52`), e o registro inclui revisão e correções de 30/10 (`registro.md` fornecido, linhas 3 e 19). Isso justifica identificar a versão final como 30/10/2026, sem sugerir que toda a pesquisa foi feita nesse dia.

Espaço: trocar apenas a data do cabeçalho, sem palavras adicionais. Preservar as datas de consulta de 28 e 29/10, inclusive o rodapé (`docs/documento.html:294`). Não fazer substituição global das datas.

### (e) Meta oficial, WAHA alternativo e alinhamento com a demo

**Concordo com Meta como canal padrão; discordo de ocultar o protocolo que a demo realmente exercita. Ganho esperado: +0,5 a +1 ponto com explicação fiel; +1 a +2 pontos com circuito local Meta demonstrável e materiais alinhados.** Os ganhos se sobrepõem ao item de arquitetura da Parte 1, não são bônus acumuláveis.

O estado verificável é:

1. O seletor oferece Meta e WAHA (`src/providers/whatsapp/index.ts:8`). A configuração padrão atual é WAHA (`src/config.ts:19`).
2. O celular gera `event: message`, `payload.from` e assinatura sha512 (`services/waha/app.ts:89`); entrega em `/webhooks/whatsapp/waha` (`services/waha/main.ts:8`) e recebe respostas por `/api/sendText` (`services/waha/app.ts:70`).
3. O adaptador Meta confere `X-Hub-Signature-256`, lê o envelope da Cloud API e envia no formato Graph (`src/providers/whatsapp/meta.ts:10`, `src/providers/whatsapp/meta.ts:73`). Há testes do contrato de assinatura, referência do anúncio e envio (`test/providers.test.ts:106`, `test/providers.test.ts:119`). Isso é evidência local de implementação, não homologação com uma conta Meta.
4. Sem credenciais, o envio Meta retorna sem entregar; com credenciais e id, o destino está fixado em `https://graph.facebook.com` (`src/providers/whatsapp/meta.ts:78`). Não existe nesse adaptador uma URL de simulador configurável. Só mudar `WHATSAPP_PROVIDER` não faz a resposta aparecer no celular local.
5. O README, “Provedor de WhatsApp: Meta ou WAHA”, declara que a operação real proposta é Meta e a demo usa o protocolo WAHA. D4 é menos explícito (`docs/documento.html:188`, `docs/documento.html:236`).

**Documento sozinho:** é honesto escrever “Canal proposto: WhatsApp Cloud API oficial da Meta; WAHA é alternativa não oficial, sujeita a avaliação”, desde que o documento não apresente o celular atual como prova integrada desse canal. É possível manter o detalhe de protocolo no README e deixar clara no documento a separação entre proposta e simulação. Ainda assim, não basta para fazer documento, README e circuito padrão demonstrarem a mesma coisa. Omissão usada para induzir que a demo fala Meta seria enganosa. Eu preferiria uma frase explícita enquanto o código permanecer assim: “A operação proposta usa Meta; a demo local exercita WAHA e o adaptador Meta tem testes de contrato.”

Também mudaria “alternativa redundante” para “alternativa não oficial avaliada, sem failover demonstrado”. Há seleção de provedor, mas ela não prova continuidade automática do mesmo número, conversa ou estado (`src/providers/whatsapp/index.ts:8`; `services/waha/app.ts:68`). Não prometeria redundância operacional com base apenas em dois adaptadores.

**Recomendação:** se houver uma nova rodada autorizada de implementação, fazer o simulador usar o formato Meta por padrão, com WAHA como modo alternativo. Manter a experiência do celular e as regras do núcleo; adaptar o envelope, sha256, endpoint de webhook e rota local de envio no formato Graph. O envio Meta precisa admitir destino local controlado na demo e mapear os números das unidades para os ids simulados, sem chamar a internet. Isso é trabalho posterior, fora desta revisão.

Estimativa minha, com base nesses pontos de acoplamento, não medição realizada:

| Trabalho posterior | Esforço estimado |
|---|---:|
| Envelope e assinatura Meta no celular, seleção de modo e entrega no endpoint correspondente | 45 a 75 min |
| Recepção local do envio no formato Graph, configuração do destino e ids por unidade | 45 a 90 min |
| Testes do circuito de ida e volta, QR, contato sem origem, repetição e regressão WAHA | 60 a 90 min |
| Ajustes de configuração de demo/compose, README, rótulos e documento | 30 a 60 min |
| **Total** | **3 a 5h15** |

Essa estimativa preserva a demo local, sem integração real com conta Meta nem failover. O adaptador pronto reduz o trabalho, mas não elimina o circuito de retorno e os testes. Não recomendo fazê-lo silenciosamente para valorizar a entrega original: somaria tempo ao desafio já excedido. Se executado depois, declarar a rodada adicional no registro.

Espaço no documento: trocar a caixa de WhatsApp por “Meta Cloud API oficial”, manter uma nota curta de simulação e substituir a linha de provedor por “Meta; WAHA não oficial como alternativa”. Retirar a repetição sobre os três serviços locais em D4 para acomodar ~30 a 45 palavras. README e código precisariam de alteração posterior, expressamente fora do arquivo autorizado agora.

### (f) Como declarar o tempo sem esconder o excedente

**Mudaria a redação e a metodologia. Ganho esperado: 0 a +1 ponto de transparência; não recupera o descumprimento do recorte.** C1 sugere dedicação máxima de quatro horas e pede entrega ao atingir o limite; C6 inclui pesquisa e demo nesse tempo. `registro.md` fornecido, linha 7, declara ~7h45 ativos “mais o tempo dos agentes”, mas a linha 9 agrupa sessões por intervalos de até 20 minutos. Essa metodologia não prova que todo esse intervalo seja atividade humana contínua.

Os blocos arredondados da tabela somam aproximadamente 7h47, compatíveis com o arredondamento de 7h45, mas não com precisão de cronômetro (`registro.md` fornecido, linhas 13 a 19). O recorte “desde o primeiro commit” da linha 21 exclui pesquisa e desenho; não pode ser usado como duração total da prova.

As medições novas de **4h33 em blocos com lacunas de até 5 minutos** e **~8h15 com lacunas de até 20 minutos, incluindo esperas por agentes**, assim como as **~10 h de paradas por limites já excluídas**, foram fornecidas pelo orquestrador no item (f) do cartão. Não recebi os logs brutos nem o script de medição; portanto não as recontei de forma independente. O registro fornecido confirma a existência das paradas excluídas, mas não contém os dois novos totais (`registro.md`, linha 21). Antes de publicar números como auditados, anexar a tabela de intervalos e fixar começo/fim da medição.

Redação recomendada para o registro, atribuída à medição fornecida:

> Ultrapassei as quatro horas sugeridas. A medição dos registros de sessão aponta 4h33 em blocos de interação contínua, com intervalos de até 5 minutos. Contando também as esperas por agentes nos blocos de até 20 minutos, foram aproximadamente 8h15. As paradas por limite de uso, cerca de 10 horas, já estão fora desses valores. Os critérios medem coisas diferentes; 4h33 não é o tempo total da entrega. Leitura fora da sessão não foi contabilizada.

Essa formulação dá destaque legítimo ao envolvimento direto e revela o tempo de processo assistido. Não chamaria 4h33 de “mãos no teclado”, pois inclui lacunas; não chamaria 8h15 de soma de horas computacionais dos agentes, pois é tempo decorrido agrupado, não soma de execuções paralelas. Não somaria 4h33 a 8h15 nem subtrairia outra vez as dez horas já excluídas. Também não afirmaria que a entrega levou quatro horas ou que o tempo real humano exato é conhecido.

No documento de cinco páginas basta: “Excedi as 4 h sugeridas; tempo e critérios de medição em docs/registro.md.” Substitui o aviso que já existe em D1, sem ocupar linha nova. No registro, substituir ~7h45 pela decomposição reconciliada, conservando a tabela de atividades. Não recomendo manter dois totais de sessões com lacunas de 20 minutos sem explicar por que diferem: ~7h45 versus ~8h15 exige o mesmo recorte temporal e inclusão de revisões posteriores. Essa diferença está pendente dos logs brutos, não deve ser resolvida por palpite.

### Outra inconsistência verificável após a leitura do registro

O README, “Resultado esperado”, apresenta a saída de `verify` como obtida com os três serviços integrados. Já `registro.md` fornecido, linha 70, delimita que `verify` usa o ERP local e que o circuito completo foi conferido ao vivo. O próprio código diz que testes e verify rodam offline (`src/config.ts:27`, `scripts/demo.ts:20`). A banca não deve receber `36/36` como prova de ida e volta entre três processos. Corrigir futuramente essa legenda fortalece transparência; não exige mais espaço nas cinco páginas, pois é alteração no README. Nesta tarefa, ela fica só como recomendação.

## Parte 3: três perguntas prováveis na apresentação

Probabilidade é julgamento deste parecer, não informação recebida da banca. As perguntas abaixo concentram os pontos que C6 diz que serão discutidos: demonstrar o fluxo, defender escolhas e reagir a mudança de requisito.

### 1. “Como você prova a origem de uma venda e o que faz quando o lead chega sem campanha?”

Resposta curta sustentada: “Mostro a jornada de Ana até o pagamento confirmado pelo ERP simulado, com oportunidade e toque ligados à venda. Para Daniel, guardo origem desconhecida; se ele informa Instagram, registro declaração sem inventar campanha. A perda de UTMs de Campinas dispara alerta, põe o ponto em auditoria e não corrige retroativamente os três leads.” Fontes: README, “O que cada cenário prova”, cenários 1, 2, 5 e 6; D2, “Níveis de origem”; `src/core/ingest.ts:25`.

Lacuna para assumir: “Preciso corrigir o denominador de 95% antes do piloto. Sessenta casos sem erro são uma verificação inicial condicionada à amostra, não garantia de qualidade em todos os canais.” Fonte: D3, checklist. Se a banca acrescentar uma segunda unidade ou pessoa sem identificador comum, explicar a limitação da igualdade exata (`src/core/identity.ts:21`), sem prometer reunião automática.

### 2. “Por que construir um núcleo próprio com Chatwoot, e o WhatsApp oficial está funcionando nesta demo?”

Resposta curta sustentada: “O desenho usa Chatwoot como caixa trocável e mantém identidade, origem e oportunidades no núcleo. O ERP continua dono de vendas e vagas. Meta é o canal oficial proposto; há adaptador com assinatura e envio no formato Graph testados localmente. O celular integrado que mostro hoje usa protocolo WAHA, não uma conta Meta.” Fontes: D4, comparação e recomendação; README, “Provedor de WhatsApp”; `test/providers.test.ts:106`; `services/waha/main.ts:8`.

Lacuna para assumir: Chatwoot não está integrado à demo, cuja tela de Atendimento ocupa esse papel (D4, nota abaixo do desenho). Ainda faltam demonstrar o circuito local Meta completo, autenticação de produção e o custo de manter o núcleo. Não defender a solução como pronta para produção; README, “Limites desta demo”, já oferece a delimitação.

### 3. “Você passou de quatro horas. O que entregaria nesse limite e como executaria sozinho nas primeiras duas semanas?”

Resposta curta sustentada: “Passei do limite e preciso declarar os critérios de medição. O recorte funcional que eu priorizaria é entrada identificada, oportunidade, atendimento e venda confirmada, mais uma falha verificável. Na operação, começo pelo inventário e por quatro pontos corrigidos, com núcleo em sombra; CRM comercial só depois do checklist.” Fontes: D1, aviso de tempo; D3, recorte das duas semanas; C5, fatia mínima; README, cenários 1 a 6.

Lacuna para assumir: não há snapshot comprovando o estado da entrega exatamente na quarta hora, nem distribuição das ~80 horas iniciais por atividade. Não afirmar que a demo atual já existia no prazo. A explicação precisa separar o que o candidato priorizaria do que os logs provam que estava pronto. O registro mostra pesquisa, desenho, mockup, nova versão do plano e revisões em blocos distintos (`registro.md` fornecido, linhas 14 a 19); a apresentação deve explicar qual dessas atividades seria reduzida, sem tratar os agentes como equipe disponível na Clinic.

## Verificação e escopo desta revisão

Verificações executadas nesta worktree: `npm.cmd run verify`, saída “36 de 36 verificações passaram”; `npm.cmd test`, 130 testes aprovados, zero falhas e zero ignorados; `npm.cmd run typecheck`, saída dos dois comandos TypeScript sem erro, código 0. O comando `npm` sem extensão foi recusado pela política de scripts do PowerShell; a execução por `npm.cmd` concluiu os mesmos scripts sem alterar a política. Não há script de lint em `package.json`.

Esses resultados confirmam as verificações locais executadas; não são teste de interface, homologação Meta, execução de Docker ou validação de cinco páginas após as sugestões. As propostas deste parecer não foram aplicadas. O único arquivo de entrega é `docs/processo/revisao-documento-sol.md`.

O comando de verificação do cartão encontrou as três partes e encerrou com código 0, sem saída. A conferência adicional não encontrou travessão longo; `git diff --check` não apontou erros, e `git status --short` mostrou somente o parecer como arquivo novo.
