# Tipos de serviço V1

Desenho de 15/11/2026, baseado em `2d4b565`.

## Como funciona hoje

- **Casa.** O `PropertyChecklistEditor` da DEC-050 permite renomear, ocultar, reordenar e tornar itens padrão opcionais, acrescentar itens e configurar estoque, fotos e instruções. O item com evidência obrigatória admite apenas mudanças que preservam essa obrigação.
- **Run.** `createChecklistRunForManager` lê o Job e a casa na transação de criação do Run inicial. Ele grava `propertyChecklistSettingsSnapshot`, `jobSnapshot` e `resolvedDefinition`. Se o Run já existe, retorna esse Run. Revisão, correções e relatórios leem a definição guardada. A definição atual é a versão 2.
- **Fotos.** A lista `requiredPhotoTypes` da casa é uma orientação congelada nos Runs V2. A exigência de evidência de `living-belongings` e a política de upload, incluindo o modo multifoto, seguem os contratos existentes.
- **Estoque.** A definição V2 combina a lista de código com os itens e ajustes da casa. Os níveis são `HIGH`, `MEDIUM`, `LOW` e `EMPTY`, com quantidade opcional de 0 a 99 em `LOW` e `EMPTY`. Runs V1 ou sem versão mantêm o nível `NEEDS_RESTOCK` e a própria lista congelada.

A implementação estende o modelo de Job e o resolvedor de checklist já usados no repositório. A consulta ao npm e ao GitHub encontrou ferramentas genéricas de checklist e de validação. O contrato de Firestore, o congelamento e a evidência já são tratados pelo CleanFlow, então a V1 aproveita essas extensões sem introduzir dependências.

## Job e telas

| Valor persistido | Nome em português |
| --- | --- |
| `STANDARD` | Padrão (troca de hóspedes) |
| `DEEP_CLEANING` | Limpeza pesada |
| `MOVE_IN_OUT` | Mudança (move-out / move-in) |
| `POST_CONSTRUCTION` | Pós-obra |

`Job.serviceType` é opcional para compatibilidade. Um Job sem o campo é lido como Padrão, sem migração ou escrita durante a leitura. O formulário de criação e o editor de detalhes permitem selecionar o tipo com as permissões existentes. A lista, o detalhe e a agenda da cleaner exibem o tipo atual do Job. As Rules validam a enumeração nas escritas de Job autorizadas. O campo fica fora de `checklistContextRevision`, pois editar o tipo não revoga o link de um Run iniciado.

O relatório do cliente usa o tipo congelado no Run. O portal lê o tipo atual nas linhas da agenda e o tipo do Run nas linhas de relatório. Runs sem tipo são apresentados como Padrão com suas seções, estoque e fotos originais. Os textos de tipos e de itens são localizados em arquivos da feature.

## Montagem e congelamento

1. Resolver o checklist e os ajustes da casa com a lógica da DEC-050.
2. Use the service-type sections only when the property has no customized checklist. An explicit property configuration takes precedence. Padrão tem zero seções extras. As seções só adicionam tarefas. Estoque, orientação de fotos e evidência obrigatória continuam sob seus contratos atuais.
3. Gravar `jobSnapshot.serviceType` e as seções em `resolvedDefinition` no mesmo Run e na mesma transação. Uma tentativa repetida devolve o Run existente. Se uma mudança de Job concorrer com a criação, o Run fica com a versão do Job lida pela transação que confirmou a criação.

Os modelos V1 são dados de código, separados do resolvedor. Limpeza pesada cobre áreas de acúmulo. Mudança inclui interiores de armários, gavetas e eletrodomésticos, rodapés e paredes. Pós-obra inclui poeira fina, resíduos de tinta e adesivos, janelas e trilhos, ralos, filtros e respiros. Na V2, o mesmo resolvedor poderá receber modelos da organização antes da criação, manter IDs estáveis e guardar no Run a definição resultante.

## Revisão e publicação

1. Modelo e Rules, com verificação de enumeração e autorização.
2. Formulário e telas de leitura, com textos locais.
3. Composição do checklist e projeções de Functions, com testes unitários, de emulador e de navegador.

### Functions

| Function existente | Alteração |
| --- | --- |
| `createChecklistRun` | Congela o tipo e acrescenta as tarefas do modelo ao montar o Run inicial. |
| `getChecklistRun` | Retorna o tipo congelado à gerente. |
| `publicChecklist` | Retorna o tipo e as tarefas do Run à cleaner. |
| `publicClientReport` | Retorna o tipo congelado no relatório liberado. |
| `publicClientPortal` | Retorna o tipo atual nas visitas e o tipo do Run nos relatórios liberados. A lista consulta o Run quando há liberação. |
| `redeemCleanerAccessCode` | Inclui o tipo ao recompor os serviços atribuídos da agenda no provisionamento. |
| `syncCleanerAgendaOnJobWrite` | Atualiza a projeção quando o Job muda, inclusive em uma edição apenas de tipo. |
| `syncCleanerAgendaOnAssignmentWrite` | Preserva o tipo na recomposição disparada por uma Assignment. |
| `syncCleanerAgendaOnOfferWrite` | Preserva o tipo dos serviços atribuídos na recomposição disparada por uma Offer. |
| `syncCleanerAgendaOnChecklistRunWrite` | Preserva o tipo na recomposição disparada pelo estado do Run. |
| `syncCleanerAgendaOnChecklistStart` | Preserva o tipo na recomposição disparada pelo primeiro progresso do checklist. |

Functions novas na V1 **0**. Atualizar juntos os seis pontos que recompõem a agenda, pois todos gravam a projeção.

### Ordem e volta atrás

Revisar nessa ordem. Publicar a pilha como uma única entrega funcional, com autorização independente da integração dos PRs. Validar o SHA oficial e as revisões atualmente ativas de Hosting, Functions e Rules. Guardar versões e artefatos de volta atrás. Aplicar a Rule aditiva, publicar as Functions existentes afetadas e verificar sua prontidão antes do Hosting que permite escolher o tipo. O teste de criação, alteração, congelamento, relatório e portal roda com dados fictícios em emulador. A verificação inicial em Production é somente leitura.

Para voltar atrás, restaurar primeiro o Hosting anterior. Se a escolha de tipo ainda não foi usada, é possível restaurar as versões anteriores das Functions afetadas e das Rules. Uma vez gravados Jobs de outros tipos, preservar as Functions capazes de montar e ler seus Runs e manter as Rules aditivas válidas. Uma correção posterior deve preservar os Runs existentes e seus snapshots. Nenhuma etapa requer migração ou reescrita de Runs.

Os novos itens guardam texto em inglês no snapshot junto com as chaves de tradução. O Hosting anterior consegue ler as tarefas pelo texto guardado. Um build de recuperação com o leitor atual preserva também o tipo e a tradução local. Revalidar Rules, inventário de Functions e os dois domínios de Hosting após cada etapa. Os executores existentes de Hosting-only e de atualização de notificações não cobrem esta combinação de alvos.

## Airbnb touch-up (added 2026-11)

`AIRBNB_TOUCH_UP` is a short refresh between stays. It adds no checklist section: the
Property checklist applies. Releasing it needs, in order: Rules (the allowed list),
then every Function that imports `functions/src/serviceTypes.js` (older Functions
normalize an unknown type to `STANDARD`), then Hosting.
