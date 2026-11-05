# Definitive UI V1 · validação de publicação

A fonte visual autoritativa é o código do Claude em `fc6f7467ca834569ca2724c5e36c1da81f0f4357`.
Compare a matriz de capturas com um build reproduzido desse SHA, usando os mesmos dados e relógio.
O recuo de 6 px no rótulo da Inbox já consta no CSS dessa fonte. Registre a diferença
em relação ao ZIP de referência como divergência do arquivo histórico. Preserve o CSS.

## Gates locais

- Execute Vitest, as suítes de segurança e as regressões E2E legadas, do Cleaner Hub
  e da Definitive UI, com projeto `demo-cleanflow`, portas exclusivas e dados sintéticos.
- No Playwright WebKit, use o build do runner `e2e/definitive-ui/run.mjs --project=webkit`.
  Ele aplica long polling ao cliente Firestore da gerente somente no modo emulador.
  O Chromium explícito e o build Production preservam o transporte padrão.
- Confirme também a sessão autenticada em Safari nativo com o build emulador
  padrão, em uma janela privada no localhost. Valide Home carregada, filtro Hoje e
  detalhe de Serviços, decisão de oferta, abertura pela Inbox e revisão de checklist.
  Use contas de fixture. Registre o SHA do build e apenas resultados sanitizados.
- Gere o build Production com `hosting-release.mjs build`, vinculado ao recibo
  COMPLETE de Release A. A guarda exige os sete WOFF2 Inter com caminho, referência
  no CSS e SHA-256 aprovados. Confirme o projeto e os hashes no manifesto.
- Execute `node e2e/pwa-entry/run.mjs` para verificar, sem JavaScript, a identidade
  de `/` e `/agenda` no emulador de Hosting. O runner também verifica as duas
  entradas, recarga, Inbox e o worker raiz em Chromium e WebKit.

## Selo e rollback

Com todos os gates aprovados, `hosting-release.mjs seal --dir <pasta> --a-dir <recibo-a>`
gera o plano e seu hash. O operador libera a publicação com autorização explícita
para `publish:<hash>` e uma janela sem outros deploys por CLI, Console ou CI.
A publicação usa somente o Firebase Hosting. O script verifica o lock, os bytes
publicados e os snapshots das dependências antes e depois.

O selo técnico pode ser gerado com o aceite físico pendente. Antes de publicar,
valide no iPhone real, em ambiente autorizado e com contas de teste. Mantenha o
ícone de gerente instalado. Abra o link pelo WhatsApp e pelo Safari, instale
Minha agenda e reabra ambos os ícones. Confirme nomes, ícones, rotas, sessão e
permissões independentes. Confira um atalho antigo e a passagem para o
checklist, que está fora do escopo da agenda. Se um atalho de teste antigo
aponta para `/`, instale a agenda pelo endereço correto e preserve o ícone
da gerente. A correção não tenta migrar o endereço de atalhos antigos.

Registre apenas o resultado sanitizado em `ios-acceptance.json` no diretório
do plano. Use `state: "PASS"`, `device: "physical-iphone"`, a versão numérica
do iOS no campo `iosVersion`, `sha` e `manifestHash` do candidato. Em `checks`,
marque como verdadeiras apenas as verificações observadas: `managerIconRetained`,
`managerIconOpensRoot`, `agendaIconOpensAgenda`, `identityAndSessionsSeparate`,
`legacyIconChecked`, `safariAndWhatsAppLinksChecked` e `checklistHandoffChecked`.
Sem esse recibo, o comando de publicação interrompe antes de acessar Production.

O comando `rollback` exige `rollback:<hash>` e a mesma exclusividade. Ele restaura
a versão finalizada do Hosting do Release A. Com recibo COMPLETE, verifica a
release atual e seus assets antes da restauração. Sem recibo e com mutex retido,
só aceita o journal local de início da publicação, a mesma titularidade do mutex,
o marcador do plano gravado na release ativa e o backend sem drift. Caso a
identidade da release fique indeterminada, preserve journal e lock para
verificação do operador.

O Release B usa o snapshot de Hosting do Release A. Após eventual publicação da
Definitive UI, sua promoção requer uma nova integração e um selo B ancorado no
recibo Hosting efetivo.
