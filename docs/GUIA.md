# MotorCaixa: guia do projeto (para estudar e manter)

Este guia explica **o que foi construído, por que e como as partes se conectam**.

## 1. Visão geral
SaaS de controle financeiro para motoristas de **carro** (Uber, 99, Particular) e **moto** (iFood, Uber, 99, Particular).
É uma única aplicação. O perfil (carro/moto) só muda as fontes de renda e as categorias padrão.

| Camada | Tecnologia | Função |
|---|---|---|
| Frontend | React 19 + TypeScript + Tailwind + shadcn/ui | Telas, formulários, gráficos (recharts) |
| Backend | Python + FastAPI | API REST em `/api`, regras de negócio, segurança |
| Banco | MongoDB (driver assíncrono Motor) | Dados centralizados com vínculo por `user_id` |
| E-mail | Resend (gerenciado pela Emergent) | Confirmação, redefinição de senha, relatório mensal |
| Agendador | Cron da plataforma (`.emergent/crons.yml`) | Chama `POST /api/cron/daily` todo dia às 08h (Brasília) |

**Por que não Node/MySQL?** O ambiente já vinha com FastAPI + MongoDB funcionando, e você aprovou seguir com essa
stack. O isolamento que em SQL viria por chave estrangeira + RLS aqui é feito por um filtro **obrigatório** `user_id`
em toda consulta, aplicado no servidor (MongoDB não tem Row Level Security).

## 2. Pastas
```
backend/
  server.py            # cria o app e monta os routers sob /api
  models/schemas.py    # contratos da API (Pydantic): validação de entrada e formato de saída
  routers/             # auth, me (ajustes), days (calendário), expenses, reports, admin, cron
  lib/security.py      # bcrypt, tokens de uso único, sessões, limite de tentativas
  lib/deps.py          # get_current_user / require_verified / require_admin
  lib/finance.py       # cálculos (fórmulas comentadas no topo)
  lib/xlsx_report.py   # planilha Excel (openpyxl)
  lib/jobs.py          # recorrentes + relatório mensal (idempotência e tentativas)
  lib/mailer.py        # envio de e-mail + templates + verificação de segurança do HTML
  seed.py              # dados de DEMONSTRAÇÃO
frontend/src/
  pages/               # Landing, Login, Signup, VerifyEmail, ForgotPassword, ResetPassword,
                       # Dashboard, CalendarPage, Expenses, Reports, Settings, Admin
  components/layout/   # AppShell (sidebar desktop + barra inferior no celular), AuthLayout
  components/finance/  # KPIs, input de dinheiro, aviso legal etc.
  lib/api.ts           # única porta de saída para a API (fetch tipado)
  lib/types.ts         # interfaces TS espelhando os modelos Pydantic
```

## 3. Segurança (o essencial)
- **Senhas**: bcrypt (custo 12). Nunca em texto puro.
- **Sessão**: cookie `httpOnly` + `Secure` + `SameSite=Lax`. O JavaScript não consegue ler o cookie (protege contra XSS).
  No banco fica só o **hash** do token. O logout apaga a sessão; trocar ou redefinir a senha derruba as outras sessões.
- **Usuário relido a cada requisição**: se o admin desativar a conta, o efeito é imediato.
- **Isolamento**: nenhuma rota financeira aceita `user_id` do navegador. Acessar um registro de outra pessoa responde
  **404** (nem confirmamos que ele existe). Isso está testado: Renata tentando editar/excluir uma despesa do Carlos → 404.
- **Mensagens neutras**: cadastro e "esqueci a senha" respondem igual existindo conta ou não. No login, "E-mail ou
  senha inválidos" (com tempo de resposta parecido).
- **Limite de tentativas** (coleção `rate_limits`): login (10 a cada 15 min por e-mail), cadastro, reenvio de confirmação
  (1/min, 5/h), recuperação de senha, envio manual de relatório (3/h).
- **Validação dupla**: o frontend valida para dar resposta rápida e o backend valida de novo (Pydantic). O servidor
  é quem decide.

## 4. Confirmação de e-mail
1. Cadastro → conta com e-mail **pendente** (`verified_email = null`).
2. Geramos um token aleatório (`secrets.token_urlsafe`) e guardamos só o **SHA-256** dele, com validade de 24h e uso único.
3. O link `/verificar-email?token=...` chama `POST /api/auth/verify-email`, que marca o token como usado de forma
   atômica (impede reutilização).
4. "Confirmado" significa `verified_email == email`. Se o usuário trocar o e-mail, a confirmação deixa de valer
   automaticamente e um novo link é enviado.
5. Sem confirmação, o usuário entra no app mas vê a tela "Confirme seu e-mail". As rotas financeiras respondem 403.

## 5. Relatório mensal automático (.xlsx)
- **Quando**: o cron roda todo dia às 11:00 UTC (08:00 de Brasília). Do dia 1 ao dia 5, ele processa o **mês anterior
  completo**. Por que dia 1? Porque o mês já fechou. Os dias 2 a 5 servem só para retentar falhas.
- **Para quem**: usuários ativos, com e-mail confirmado e com "Receber automaticamente" ligado em Ajustes.
- **Sem entrega equivocada**: o destinatário é relido do banco no momento do envio (e-mail atual e confirmado). A planilha
  é montada só com consultas filtradas pelo `user_id` daquele usuário.
- **Sem duplicidade**: índice único `(user_id, period, "auto")` em `report_runs`. Se o cron disparar duas vezes, o
  segundo disparo é ignorado. O cabeçalho `X-Webhook-Id` também é registrado em `cron_runs`.
- **Falhas**: até 3 tentativas por envio (com espera crescente) e até 3 execuções do agendador. Falhas de cobrança da
  plataforma de e-mail não são repetidas. Tudo fica em `report_runs` e `email_logs`, **sem valores financeiros**.
- **Mês sem lançamentos**: enviamos um e-mail avisando que não houve lançamentos, sem planilha.
- **Anexo**: por padrão a planilha vai anexada. O usuário pode desligar em Ajustes: aí o e-mail só avisa, e a planilha é
  baixada no app, com login (`GET /api/reports/xlsx/AAAA-MM`). Nenhum link público é criado.
- **Abas**: Resumo · Faturamento diário (uma coluna por fonte; "Sem registro" ≠ "Folga/zero") · Despesas · Por categoria.
- Testar localmente: `curl -X POST localhost:8001/api/cron/daily -H "Authorization: Bearer $WEBHOOK_CRON_SECRET"`.
  Ou, no painel Admin, use "Processar lote agora".

## 6. Regras financeiras
- Valores sempre em **centavos (int)**, o que evita erros de arredondamento.
- Um documento por usuário e dia (`days`), com índice único: editar o dia substitui o registro, nunca duplica.
- **Sem registro** (nada lançado) ≠ **Folga/zero** (você marcou folga ou informou R$ 0,00).
- **Recorrentes**: no dia do vencimento, a regra gera a despesa do mês uma única vez (índice único por competência).
  Se você já lançou manualmente uma despesa com a mesma descrição e categoria no mês, ela **não** é gerada.
- Resultado operacional = faturamento − despesas registradas. **Não é lucro contábil/fiscal.**

## 7. Admin
Login `admin@motorcaixa.com.br`. Vê estatísticas, lista de usuários (ativar/desativar, plano, papel, marcar e-mail
como confirmado, enviar relatório), lote mensal, logs de envio e de e-mail, auditoria e preço do plano Pro.
Toda ação do admin fica registrada em `audit_logs`. O admin não pode remover o próprio acesso.

## 8. O que NÃO foi feito (ainda)
- **Cobrança/assinatura**: os planos Free/Pro e o preço (configurável no admin) existem, mas **não há pagamento
  integrado** e nenhum recurso é bloqueado por plano. Próximo passo: Mercado Pago, Asaas ou Stripe em sandbox, com webhook.
- Exclusão de conta (LGPD) e exportação completa dos dados.

## 9. Como rodar
```bash
cd backend && cp .env.example .env   # preencha os valores
pip install -r requirements.txt
python seed.py                       # cria admin + contas demo
uvicorn server:app --reload --port 8001
cd ../frontend && yarn && yarn dev   # http://localhost:3000
```
