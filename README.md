# CI/CD Demo

Projeto curto para acompanhar, em oito etapas, uma aplicação Express da execução local até o deploy em um servidor Linux via SSH.

## Arquitetura final

```text
Developer → GitHub → CI (lint + testes) → Docker build → GHCR
                                                     ↓
Remote server ← SSH ← docker compose pull ← deploy após CI verde
      └── docker compose up -d → health check HTTP
```

O servidor baixa uma imagem já publicada; ele não faz build do código.

## Pré-requisitos

- Node.js 22 ou mais recente e npm.
- GitHub Actions habilitado no repositório e branch padrão `main`.
- Docker com Compose para testar localmente.
- Uma máquina Debian/Ubuntu existente, acessível por SSH, com uma chave pública autorizada para o usuário de deploy. Provisionamento de VM e configuração de rede ficam fora da aula.

## 1. Rodando a aplicação localmente

```bash
npm ci
npm start
```

Abra `http://localhost:3000/` (`CI/CD Demo`) ou `http://localhost:3000/health` (`{"status":"ok"}`). A porta padrão é 3000; configure outra com `PORT=...`.

## 2. Lint e testes

```bash
npm run lint
npm test
```

Os testes usam o test runner incluído no Node e exercitam os dois endpoints por HTTP.

## 3. Introdução ao GitHub Actions

Os workflows ficam em `.github/workflows/`. Acompanhe uma execução pela aba **Actions**. `ci.yml` é a primeira automação; o workflow `deploy.yml` é introduzido depois e aguarda o CI terminar.

## 4. Entendendo o CI

`ci.yml` executa em `push` e `pull_request`: checkout, Node 22 com cache npm, `npm ci`, lint e testes. Se um comando falhar, o job fica vermelho. O token tem somente `contents: read`.

## 5. Containerizando a aplicação

```bash
docker build -t cicd-demo .
docker run --rm -p 3000:3000 cicd-demo
```

O Dockerfile instala apenas dependências de produção e roda como o usuário `node`. O healthcheck da imagem consulta `/health`.

## 6. Publicando no GHCR

Após o CI da branch `main` terminar verde, `deploy.yml` publica `ghcr.io/<owner>/<repository>` com as tags `latest` e `sha-<commit-completo>`. Pull requests não publicam imagens. O workflow usa `GITHUB_TOKEN`, `packages: write` somente no job de publicação e as ações oficiais de login, metadata, Buildx e build/push.

Na primeira publicação, se a aula for usar pulls anônimos, abra a página do pacote em **GitHub → Packages → Package settings → Change visibility → Public**. Para pacote privado, autentique o host uma vez com uma credencial que tenha somente `read:packages`:

```bash
read -r -s GHCR_TOKEN
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u SEU_USUARIO --password-stdin
unset GHCR_TOKEN
```

Não salve essa credencial no repositório ou no `.env` da aplicação. Para esta aula, imagem pública simplifica a configuração da máquina.

## 7. Preparando o servidor

Com a máquina Debian/Ubuntu já criada e acessível, execute o bootstrap a partir do repositório:

```bash
bash deploy/install-docker.sh
```

O script instala Docker Engine e Compose pelo repositório oficial, habilita o serviço, garante `curl` e adiciona o usuário atual ao grupo `docker`. Faça logout/login para aplicar a nova associação. O usuário também precisa ter a chave pública correspondente a `DEPLOY_SSH_KEY` autorizada para login SSH. O workflow copia `deploy/docker-compose.example.yml` para `~/cicd-demo/docker-compose.yml` e grava o `.env` com o SHA da imagem.

Para preparar os mesmos arquivos manualmente, copie o exemplo para o servidor e crie `.env` a partir do modelo, ajustando o nome da imagem GHCR:

```bash
mkdir -p ~/cicd-demo
cp deploy/docker-compose.example.yml ~/cicd-demo/docker-compose.yml
cp .env.example ~/cicd-demo/.env
# Edite ~/cicd-demo/.env e defina IMAGE=ghcr.io/<owner>/<repository>
```

Depois, no servidor, `cd ~/cicd-demo && docker compose pull && docker compose up -d` usa essa configuração.

## 8. Configurando secrets

Em **Settings → Secrets and variables → Actions**, adicione estes repository secrets:

| Secret | Finalidade |
| --- | --- |
| `DEPLOY_HOST` | IP ou hostname do servidor |
| `DEPLOY_USER` | Usuário SSH autorizado |
| `DEPLOY_SSH_KEY` | Chave privada SSH desse usuário, incluindo as linhas de início/fim |
| `DEPLOY_PORT` | Porta SSH; opcional, usa 22 quando ausente ou vazia |

Adicione também a repository variable `DEPLOY_KNOWN_HOSTS` com a chave pública do host no formato `known_hosts`. Obtenha-a com `ssh-keyscan -p PORT HOST` e confira a fingerprint por um canal confiável antes de salvar. Isso permite ao SSH validar a identidade do servidor. A variable `APP_PORT` é opcional e define a porta publicada no host; o padrão é 3000.

## 9. Deployment automático

`deploy.yml` escuta a conclusão do workflow `CI` na branch `main`. Só continua quando o resultado for `success`. Primeiro publica `latest` e `sha-<commit>`; em seguida, o job de deploy copia `deploy/docker-compose.example.yml` para o servidor como `docker-compose.yml` e grava o SHA exato em `.env` via SSH. No servidor executa:

```bash
cd ~/cicd-demo
docker compose pull
docker compose up -d
```

Depois, o job consulta `http://localhost:<APP_PORT>/health` com tentativas. Se a aplicação não responder com sucesso, o job falha.

## 10. Validando a aplicação

Localmente, confira `/` e `/health` no navegador ou com `curl`. No servidor, o workflow valida `/health`; para conferir depois:

```bash
ssh USUARIO@HOST 'cd ~/cicd-demo && docker compose ps && docker compose logs --tail=50'
ssh USUARIO@HOST 'curl --fail http://localhost:3000/health'
```

## 11. Como provocar uma falha no CI

Em `src/app.js`, adicione temporariamente uma declaração não usada, por exemplo `const demoFailure = true;`. O lint acusa `no-unused-vars`, o CI fica vermelho e a publicação/deploy é ignorada. Remova a linha e envie a correção, o pipeline `CI` deverá ficar verde.

## 12. Como acompanhar um deployment

Na aba **Actions**, abra primeiro a execução de CI. Quando ficar verde, abra **Deploy**: acompanhe a publicação da imagem e depois os passos de SSH, Compose e health check. As tags SHA conectam o servidor ao commit publicado.

## 13. Rollback simples

Escolha a tag SHA da versão anterior no histórico do GitHub/Packages e, no servidor, altere `IMAGE_TAG` no arquivo `~/cicd-demo/.env` para esse valor completo (`sha-...`). Então:

```bash
cd ~/cicd-demo
docker compose pull
docker compose up -d
curl --fail --retry 10 --retry-delay 2 http://localhost:3000/health
```

Para retornar à versão atual, restaure em `IMAGE_TAG` o SHA que está em produção. A tag `latest` é conveniente, mas o SHA permite selecionar a versão exata.

## 14. Fluxo completo

```text
git push / merge em main
  → CI: npm ci, lint, testes
  → build e publicação no GHCR (latest + sha-...)
  → SSH: copiar Compose e selecionar o SHA
  → docker compose pull && docker compose up -d
  → health check HTTP (falha o job se a resposta falhar)
```

## Instructor: navigating lesson states

Os estados da aula estão marcados por tags locais no histórico. Liste-as e troque de estado com checkout (isso deixa a worktree em detached HEAD):

```bash
git tag --list 'lesson-*'
git checkout lesson-03-ci
git checkout lesson-02-tests   # voltar uma etapa
git diff lesson-03-ci..lesson-04-docker
git show --stat lesson-04-docker
git log --oneline --decorate --graph
```

Antes de avançar, compare a etapa atual com a seguinte:

```bash
git diff lesson-03-ci..lesson-04-docker
```

Para retornar à ponta da branch da aula, use `git switch class/demo`.
