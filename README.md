# CI/CD Demo

Aplicação Express mínima com integração e entrega contínuas usando GitHub Actions, Docker, GitHub Container Registry (GHCR) e SSH. Cada alteração passa por lint e testes. Quando uma execução do CI na branch `main` termina com sucesso, o workflow publica uma imagem Docker e pode atualizá-la em um servidor Linux.

O servidor executa uma imagem já publicada no GHCR; o build da imagem acontece no GitHub Actions.

## Requisitos

- Node.js 22 ou mais recente e npm para desenvolvimento local.
- Docker com Docker Compose para executar a aplicação em contêiner.
- Para deploy automático: repositório no GitHub com Actions habilitado e um servidor Debian ou Ubuntu acessível por SSH.

## Executar localmente

Instale as dependências, rode o lint e os testes e inicie a aplicação:

```bash
npm ci
npm run lint
npm test
npm start
```

A aplicação usa a porta 3000 por padrão. Configure `PORT` para escolher outra porta. Os endpoints disponíveis são:

- `http://localhost:3000/` — retorna `CI/CD Demo`.
- `http://localhost:3000/health` — retorna `{"status":"ok"}`.

## Executar com Docker

```bash
docker build -t cicd-demo .
docker run --rm -p 3000:3000 cicd-demo
```

A imagem instala apenas dependências de produção, executa como o usuário `node` e verifica a saúde da aplicação em `/health`.

## Integração contínua

O workflow `CI` em `.github/workflows/ci.yml` executa em cada `push` e `pull_request`. Ele instala as dependências com `npm ci` e roda `npm run lint` e `npm test`. Qualquer falha deixa a execução vermelha. O workflow precisa concluir com sucesso para que uma imagem seja publicada.

Para reproduzir uma falha de lint, adicione temporariamente ao escopo do módulo em `src/app.js` uma variável não usada:

```js
const demoFailure = true;
```

`npm run lint` deve falhar com `no-unused-vars`. Remova a linha para corrigir a falha. Um pull request executa o CI, mas não inicia o workflow **Deploy**: esse workflow acompanha somente conclusões do CI na branch `main`.

## Publicação e deploy

Depois que o CI na `main` termina com sucesso, `Deploy` publica `ghcr.io/<owner>/<repository>` com as tags `latest` e `sha-<commit>`. Em seguida, conecta-se ao servidor por SSH, copia a configuração do Compose, seleciona a imagem daquele commit e executa `docker compose pull` e `docker compose up -d`. Por fim, verifica `/health`. Se a publicação, conexão, atualização ou verificação falhar, o job correspondente fica vermelho.

Se o CI na `main` falhar, o workflow **Deploy** é iniciado, mas os jobs de publicação e deploy são ignorados. Uma falha de CI num pull request não inicia esse workflow.

### Preparar o servidor

Use um servidor Debian ou Ubuntu já criado e acessível por SSH. Execute o script de instalação a partir deste repositório:

```bash
bash deploy/install-docker.sh
```

O script instala Docker Engine e Compose pelo repositório oficial, habilita o serviço, instala `curl` e adiciona o usuário atual ao grupo `docker`. Encerre e reabra a sessão SSH para aplicar a associação ao grupo. A chave pública correspondente à chave privada configurada no GitHub precisa estar autorizada para esse usuário.

O primeiro deploy cria `~/cicd-demo`, instala `docker-compose.yml` e grava `.env` com a imagem e o SHA publicados. Para configurar o Compose manualmente, use o exemplo incluído:

```bash
mkdir -p ~/cicd-demo
cp deploy/docker-compose.example.yml ~/cicd-demo/docker-compose.yml
cp .env.example ~/cicd-demo/.env
```

Edite `~/cicd-demo/.env` e substitua `IMAGE` pelo caminho GHCR deste repositório, por exemplo `ghcr.io/usuario/repositorio`. Depois, inicie a aplicação:

```bash
cd ~/cicd-demo
docker compose pull
docker compose up -d
```

### Configurar o GitHub Actions

Em **Settings → Secrets and variables → Actions**, configure estes repository secrets:

| Secret | Valor |
| --- | --- |
| `DEPLOY_HOST` | IP ou hostname do servidor |
| `DEPLOY_USER` | Usuário autorizado a conectar por SSH |
| `DEPLOY_SSH_KEY` | Chave privada SSH desse usuário, incluindo as linhas de início e fim |
| `DEPLOY_PORT` | Porta SSH; opcional, padrão `22` |

Configure também estas repository variables:

| Variable | Valor |
| --- | --- |
| `DEPLOY_KNOWN_HOSTS` | Chave pública do servidor no formato `known_hosts` |
| `APP_PORT` | Porta publicada no host; opcional, padrão `3000` |

Você pode obter a entrada `known_hosts` com `ssh-keyscan -p PORT HOST`, mas confira a fingerprint por um canal confiável antes de salvá-la. O workflow valida a identidade do servidor usando esse arquivo.

Na primeira publicação, o pacote GHCR pode ficar privado. Se o servidor precisar baixar a imagem sem autenticação, altere a visibilidade do pacote para público em **GitHub → Packages → Package settings → Change visibility**. Para manter o pacote privado, autentique o servidor no GHCR com uma credencial que tenha somente `read:packages`:

```bash
read -r -s GHCR_TOKEN
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u SEU_USUARIO --password-stdin
unset GHCR_TOKEN
```

Não armazene o token no repositório nem no `.env` da aplicação.

## Verificar e acompanhar o deploy

Na aba **Actions**, consulte primeiro a execução de `CI` e depois a de `Deploy` para alterações na `main`. No servidor, confira o estado e os logs do contêiner:

```bash
ssh USUARIO@HOST 'cd ~/cicd-demo && docker compose ps && docker compose logs --tail=50'
ssh USUARIO@HOST 'curl --fail http://localhost:3000/health'
```

Se `APP_PORT` estiver configurada com um valor diferente, use essa porta no comando `curl`. As tags SHA permitem identificar exatamente qual commit está em execução.

## Rollback

Para voltar a uma versão anterior, edite `IMAGE_TAG` em `~/cicd-demo/.env` e defina a tag completa `sha-...` daquela versão. Em seguida:

```bash
cd ~/cicd-demo
docker compose pull
docker compose up -d
curl --fail --retry 10 --retry-delay 2 --retry-connrefused http://localhost:3000/health
```

Use a porta configurada em `APP_PORT` se ela for diferente de `3000`. Para retornar à versão mais recente, defina `IMAGE_TAG=latest` ou selecione o SHA desejado.
