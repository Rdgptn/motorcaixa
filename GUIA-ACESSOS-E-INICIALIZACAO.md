# MotorCaixa — Acessos e inicialização local

Este arquivo reúne os acessos de demonstração e os comandos para iniciar o projeto no Ubuntu pelo terminal integrado do VS Code.

> **Segurança:** estas credenciais são apenas para desenvolvimento/demonstração. Troque a senha administrativa antes de qualquer uso real e nunca publique este arquivo junto com o sistema em produção.

## Estrutura principal

Depois de extrair o ZIP, a raiz correta do projeto é:

```text
/home/rodrigo/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main
```

Dentro dela existem:

```text
backend/   # API FastAPI + MongoDB
frontend/  # React + Vite
```

## Acessos de demonstração

### Administrador

```text
E-mail: admin@motorcaixa.com.br
Senha:  Admin@2026
```

### Usuário demo 1

```text
E-mail: carlos.demo@example.com
Senha:  Demo@2026
```

### Usuário demo 2

```text
E-mail: renata.demo@example.com
Senha:  Demo@2026
```

Se os usuários não existirem no banco local, execute o seed conforme indicado abaixo.

## 1. Iniciar o MongoDB

O backend usa MongoDB na porta `27017`. Se estiver usando Docker:

```bash
sudo systemctl enable --now docker
sudo docker start motorcaixa-mongo 2>/dev/null || sudo docker run -d \
  --name motorcaixa-mongo \
  --restart unless-stopped \
  -p 27017:27017 \
  -v motorcaixa-mongo-data:/data/db \
  mongo:8
```

Verificar:

```bash
sudo docker ps
sudo docker exec motorcaixa-mongo mongosh --eval 'db.runCommand({ ping: 1 })'
```

O resultado do ping deve conter `ok: 1`.

## 2. Configurar e iniciar o backend

Abra um terminal no VS Code e execute:

```bash
cd ~/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/backend
```

Na primeira execução, crie o ambiente virtual:

```bash
python3 -m venv .venv
```

Ative-o em cada novo terminal:

```bash
source .venv/bin/activate
```

Instale as dependências:

```bash
python -m pip install -r requirements.txt
```

O arquivo de ambiente deve estar neste caminho:

```text
/home/rodrigo/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/backend/.env
```

Se ainda não existir:

```bash
cp .env.example .env
```

Configuração local mínima do `.env`:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=motorcaixa
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
APP_URL=http://localhost:3000
COOKIE_SECURE=false
DOCUMENT_HASH_SECRET=gere-um-segredo-aleatorio-com-pelo-menos-32-caracteres
```

Inicie a API:

```bash
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Deixe esse terminal aberto.

Teste a API em outro terminal:

```bash
curl -i http://127.0.0.1:8001/api/auth/me
```

A resposta `401 Unauthorized` com `Sessão ausente` é normal antes do login e confirma que a API está respondendo.

### Criar ou atualizar as contas demo

Com o ambiente virtual ativo e o MongoDB funcionando:

```bash
cd ~/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/backend
source .venv/bin/activate
python seed.py
```

## 3. Iniciar o frontend

Abra um segundo terminal no VS Code:

```bash
cd ~/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/frontend
```

Na primeira execução:

```bash
npm install
```

Inicie o frontend:

```bash
npm run dev
```

Abra o endereço informado pelo Vite, normalmente:

```text
http://localhost:3000
```

ou:

```text
http://localhost:5173
```

## Fluxo com três terminais

### Terminal 1 — MongoDB/Docker

```bash
sudo docker start motorcaixa-mongo
```

### Terminal 2 — Backend

```bash
cd ~/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/backend
source .venv/bin/activate
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Terminal 3 — Frontend

```bash
cd ~/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/frontend
npm run dev
```

## Problemas comuns

### `Address already in use`

A API já está rodando. Não inicie outra cópia. Verifique:

```bash
curl -i http://127.0.0.1:8001/api/auth/me
```

Se precisar encerrar a cópia existente:

```bash
fuser -k 8001/tcp
```

Depois inicie o backend novamente.

### `vite: not found`

Você está na pasta correta, mas ainda não instalou as dependências:

```bash
cd ~/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/frontend
npm install
npm run dev
```

### `python: command not found`

Use `python3` ou ative o ambiente virtual:

```bash
source ~/Downloads/motorcaixa-main-npm-corrigido/motorcaixa-main/backend/.venv/bin/activate
python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Login retorna `500`

Verifique se o MongoDB está ativo, se o backend está usando o `.env` correto e execute:

```bash
python seed.py
```

### Login fica carregando

Confirme que os dois processos estão ativos:

```bash
curl -i http://127.0.0.1:8001/api/auth/me
```

E mantenha o terminal do backend aberto para visualizar os erros da API.
