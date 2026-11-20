# MotorCaixa

Aplicação de gestão financeira para motoristas, com calendário de faturamento, despesas, relatórios, envio mensal de Excel, painel administrativo, trial de 14 dias e assinatura Pro.

A estrutura funcional detalhada está em [`docs/ESTRUTURA-PROJETO.md`](docs/ESTRUTURA-PROJETO.md). O relatório da auditoria está em [`docs/AUDITORIA-RESULTADO.md`](docs/AUDITORIA-RESULTADO.md).

## Abrir no VS Code

Abra a pasta raiz `motorcaixa-main` no VS Code. O frontend e o backend são processos separados. O frontend usa npm e o backend usa Python.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend abre em `http://localhost:5173` ou na porta indicada pelo Vite. Para uma execução semelhante ao ambiente de preview, use `npm run start`, que escuta em todas as interfaces na porta 3000. Para validar o pacote, use `npm run build` e `npm run typecheck`.

O projeto mantém todas as dependências no `frontend/package.json`; não é necessário instalar pacotes globalmente. Os plugins `@tailwindcss/vite` e `@emergentbase/*` são dependências de desenvolvimento declaradas no próprio projeto.

### Backend

Crie um ambiente virtual e instale as dependências:

```bash
cd backend
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

O arquivo `.env` deve receber `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`, `DOCUMENT_HASH_SECRET` e as variáveis do Stripe quando a cobrança for ativada. Nunca envie o `.env` para o Git ou para outra pessoa.

O frontend encaminha chamadas `/api` para `http://localhost:8001`. Para usar outra porta, ajuste o proxy em `frontend/vite.config.ts`.

## Funcionalidades principais

O cadastro exige CPF ou RG e consentimento. O documento é validado e transformado em fingerprint HMAC para impedir mais de uma conta por documento sem armazenar o valor puro. Cada conta recebe 14 dias de teste. Depois disso, as rotas financeiras ficam bloqueadas até uma assinatura ativa.

O checkout Stripe é iniciado por `/api/billing/checkout`, e o webhook assinado deve ser configurado em `/api/billing/webhook`. O MotorCaixa não recebe nem armazena dados de cartão.

## Migração de contas antigas

Depois de fazer backup do MongoDB, execute manualmente:

```bash
cd backend
python migrations/backfill_trial.py
```

A migração concede 14 dias a partir da execução para contas antigas sem dados de trial. Revise o resultado antes de liberar a aplicação.

## Segurança antes de produção

Configure um `DOCUMENT_HASH_SECRET` aleatório com pelo menos 32 caracteres, restrinja `CORS_ORIGINS` aos domínios oficiais, ative HTTPS, configure Stripe em modo de teste e valide os webhooks. Consulte [`docs/AUDITORIA-SEGURANCA.md`](docs/AUDITORIA-SEGURANCA.md) e [`docs/AUDITORIA-RESULTADO.md`](docs/AUDITORIA-RESULTADO.md) para as pendências de integração, CSRF e LGPD.
