# Definitive UI V1 · publicação Hosting em duas etapas

Este procedimento vincula a operação ao plano e ao manifesto já selados para o SHA
`a7cdb66407a07097a3952d1197a6131e8c43f6e0`. A ativação provisória serve os arquivos
em Production enquanto o operador verifica a instalação no iPhone. O mutex permanece
retido até o aceite físico ou a restauração verificada da versão de rollback.

- Projeto `clean-flow-prototipo`, origem `https://clean-flow-prototipo.web.app`.
- Plano original SHA-256 `9701df75ff04adaa9840231ee0154a9a5840ec846295c8024111a734aa3974d1`.
- Manifesto SHA-256 `c541289e54f4678802e682308480700a7a108feb632039812d19fb455b1da7cc`.
- Baseline Release A, SHA `12f432dd46a6c93e45bfb78ac1993568143c3840`, versão de rollback `2aa48a01a2244d34`.
- Escopo Firebase Hosting. Functions, Rules, dados operacionais, FCM, Release B e ofertas automáticas ficam fora da operação.
- A publicação original descrita em [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md) continua disponível com o aceite físico anterior à publicação. Use um único procedimento por tentativa.

## Antes de abrir a janela

Disponibilize o iPhone físico no Espelhamento, registre a versão numérica do iOS e
reserve tempo para todos os checks e o rollback. Confirme a exclusividade com quem
controla CLI, Console e CI durante toda a tentativa. O mutex impede concorrência
entre operadores que o respeitam. A disponibilidade do mutex sozinha não demonstra
que outros canais de deploy estão suspensos.

Confirme a disponibilidade das sessões e dos cenários autorizados no domínio real
antes do deploy provisório. Isso inclui um ícone existente da gerente, um atalho
legado identificável, contas de teste autorizadas da gerente e da cleaner, um link
de teste já acessível no WhatsApp e um checklist de teste autorizado que possa ser
aberto sem concluir a operação. Preserve a separação entre contas, dispositivos e
dados reais. A política de [ambientes](../SANDBOX_ENVIRONMENT.md) reserva a criação
de dados demo ao Sandbox. Pare se um cenário depender de criar registros ou
reaproveitar uma conta ou dados operacionais em Production.

Abrir o checklist pela Agenda aciona `openMyChecklist`, que emite uma capability
e grava a concessão de acesso da cleaner. Mesmo sem enviar respostas, esse
passo precisa de autorização para o efeito em um cenário de teste já existente.
Se for preciso resgatar um código da cleaner no app recém-instalado, use somente
um código de teste cujo consumo e alteração da sessão tenham sido autorizados.
A autorização para publicar Hosting não concede acesso a dados operacionais.

Use o build existente e o recibo COMPLETE do Release A. Execute com Node 22.12.0
e Firebase Tools 15.28.1 a partir do worktree de tooling. Crie uma pasta privada
por tentativa sob o `.tmp` desse worktree, separada da revisão original.

```sh
candidate="/caminho/absoluto/para/worktree-do-candidato"
review="$candidate/.tmp/agenda-pwa-p0.CmHiCF/review"
release_a="/caminho/absoluto/para/review-do-release-a"
mkdir -p .tmp
operation=$(mktemp -d "$PWD/.tmp/hosting-two-phase.XXXXXX")
readiness="/caminho/absoluto/para/prontidao-confirmada.json"

runbook() {
  node docs/definitive-ui/hosting-two-phase.mjs "$@" \
    --candidate-root "$candidate" --dir "$review" \
    --a-dir "$release_a" --operation-dir "$operation"
}

runbook seal
runbook preflight
```

`seal` grava `operational-seal.json` e vincula o procedimento ao selo original.
Defina `operational_seal_sha256` com o SHA-256 emitido pelo comando. `preflight`
consulta Production e verifica a correspondência com o baseline e a versão de
rollback FINALIZED. O preflight é repetido antes da alteração. O resultado
`PREFLIGHT_BLOCKED_READINESS` (código 2) indica que as verificações técnicas
passaram, mas ainda falta confirmar a prontidão física e a janela exclusiva.

Registre a prontidão no arquivo indicado por `--readiness`. Use `sealHash` igual
ao SHA-256 operacional, `origin` igual à origem de Production, `confirmedAt` com
o horário da confirmação do operador e `exclusiveUntil` com o fim da janela, ambos
em UTC ISO 8601. Registre a confirmação até 30 minutos antes da execução e
reserve pelo menos cinco minutos após o prazo do teste para a restauração.
O objeto `checks` tem os campos abaixo. Cada valor só pode ser `true` após a
confirmação correspondente.

| Campo | Evidência esperada |
| --- | --- |
| `exclusiveCliConsoleCi` | Responsáveis confirmaram a janela para todos os canais de publicação. |
| `physicalIphoneMirroring` | iPhone físico disponível com Espelhamento operacional. |
| `managerTestSession` | Sessão de teste da gerente autorizada e pronta. |
| `cleanerTestSession` | Sessão de teste da cleaner autorizada e pronta. |
| `legacyTestShortcut` | Atalho legado identificado no aparelho. |
| `safariWhatsAppTestLinks` | Links de teste prontos para abrir no Safari e WhatsApp. |
| `authorizedChecklist` | Checklist de teste existente, com autorização para abrir e emitir a concessão de acesso. |

```sh
runbook preflight --readiness "$readiness"
runbook stage --approve "stage:$operational_seal_sha256" \
  --exclusive-window --readiness "$readiness" --minutes 15
```

`--minutes` define o prazo do teste físico. O padrão é 15 minutos e a faixa
permitida é de 5 a 20 minutos.

Mantenha o processo de `stage` ativo enquanto executa o teste. Aguarde a confirmação
de que a ativação provisória, os arquivos e a configuração estão verificados.
Consulte `state.json` para obter o identificador da tentativa, a versão e a
release do Hosting, além do prazo.

## Aceite físico no domínio real

1. Registre a presença do ícone existente da gerente. Abra-o e verifique o destino `/`
   e a sessão autorizada da gerente. Preserve esse ícone e confira sua presença
   novamente depois da instalação da agenda.
2. Abra o link de teste `https://clean-flow-prototipo.web.app/agenda` no WhatsApp e
   no Safari. Registre o destino e a passagem do navegador embutido para o Safari,
   conforme oferecida pelo iOS.
3. No Safari, adicione Minha Agenda à Tela de Início como app da web. Confira nome
   e ícone, abra pelo ícone e verifique o destino `/agenda` em modo instalado.
4. Confirme a sessão autorizada da cleaner pelo ícone da agenda e a da gerente pelo
   ícone existente. Confira a persistência após reabertura e a separação de
   identidade e permissões.
5. Abra o atalho legado e registre o destino real. A instalação nova deve coexistir
   com o atalho e com o ícone da gerente.
6. Abra o checklist autorizado a partir da agenda e retorne ao app instalado.
   Verifique a passagem pelo navegador quando o destino estiver fora de `/agenda`.
   Termine a verificação sem registrar uma conclusão de checklist.

Registre o resultado em `ios-live-acceptance.json` na pasta da tentativa. Use
`state: "PASS"`, `device: "physical-iphone"`, a versão numérica do iOS,
`sha` e `manifestHash` do build, `attemptId`, `origin`, `hostingVersion`,
`hostingRelease` e `observedAt` da janela ativa. `observedAt` é um horário UTC
ISO 8601 após as observações, dentro do prazo. Os sete itens de `checks` são
`managerIconRetained`, `managerIconOpensRoot`, `agendaIconOpensAgenda`,
`identityAndSessionsSeparate`, `legacyIconChecked`, `safariAndWhatsAppLinksChecked`
e `checklistHandoffChecked`. Todos devem estar comprovados antes de gravar o
arquivo. Use uma gravação atômica, preparando o arquivo temporário na mesma pasta
e renomeando para o nome final. Mantenha os registros sanitizados, sem códigos de
acesso, credenciais, IDs de contas, conteúdo de mensagens ou dados operacionais.

A evidência `OBSERVATIONS_ONLY` da prévia isolada documenta o comportamento anterior
de instalação. O recibo desta operação vincula o aceite ao domínio e à release
provisória de Production.

## Rollback e recuperação

Em falha do teste físico, grave um arquivo `rollback-request.json` na pasta da
tentativa. A presença do arquivo solicita a restauração.
O processo tenta restaurar a versão selada também se o prazo expirar ou houver
erro. O mutex continua retido até a comprovação da restauração. Aguarde o resultado
verificado antes de encerrar a exclusividade.

Se o processo morrer, preserve a pasta da tentativa e a exclusividade. Confirme
que o processo anterior terminou antes de usar a recuperação:

```sh
runbook recover --approve "stage:$operational_seal_sha256" --exclusive-window
```

`recover` restaura somente quando a identidade da publicação ou do rollback em
andamento e a titularidade do mutex são comprovadas. Qualquer divergência no estado
ativo ou ausência de evidência de titularidade exige verificação operacional
preservando os arquivos e o mutex. O rollback só encerra a operação após a versão
original, sua configuração e seus arquivos publicados serem conferidos.

Se um processo de recuperação também morrer, preserve `recovery-worker.json`.
Um operador deve comprovar que ambos os processos terminaram antes de arquivar
esse marcador local e repetir somente a recuperação. Nunca reinicie a etapa de
publicação para resolver um POST incerto.
