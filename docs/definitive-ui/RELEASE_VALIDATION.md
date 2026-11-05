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

## Selo e rollback

Com todos os gates aprovados, `hosting-release.mjs seal --dir <pasta> --a-dir <recibo-a>`
gera o plano e seu hash. O operador libera a publicação com autorização explícita
para `publish:<hash>` e uma janela sem outros deploys por CLI, Console ou CI.
A publicação usa somente o Firebase Hosting. O script verifica o lock, os bytes
publicados e os snapshots das dependências antes e depois.

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
