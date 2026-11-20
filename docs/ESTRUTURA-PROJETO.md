# Estrutura funcional do MotorCaixa

## Backend (`backend/`)

- `server.py`: inicialização FastAPI, CORS e montagem de rotas `/api`.
- `models/schemas.py`: contratos de entrada e saída da API.
- `lib/database.py`: conexão MongoDB e índices de integridade.
- `lib/auth_dependencies.py`: sessão, e-mail confirmado, assinatura e autorização.
- `lib/security.py`: bcrypt, tokens, cookies, sessões e rate limit.
- `lib/identity.py`: normalização, validação e fingerprint de CPF/RG.
- `lib/response_serializers.py`: conversão de documentos Mongo para respostas sem campos sensíveis.
- `lib/defaults.py`: categorias, fontes de renda e configuração padrão do plano.
- `lib/finance.py`: cálculos financeiros e consolidação de resultados.
- `lib/mailer.py`: e-mails de confirmação, recuperação e relatórios.
- `lib/xlsx_report.py`: geração do Excel mensal.
- `routers/auth.py`: cadastro, login, logout, confirmação e recuperação de senha.
- `routers/profile.py`: perfil, preferências, fontes, categorias e planos.
- `routers/earnings_calendar.py`: calendário e registros diários de faturamento.
- `routers/expenses.py`: despesas pontuais e recorrentes.
- `routers/reports.py`: dashboard, relatórios, CSV e Excel.
- `routers/billing.py`: checkout e webhook de assinatura Stripe.
- `routers/admin.py`: administração e auditoria.
- `routers/scheduled_reports.py`: envio automático e tarefas agendadas.
- `migrations/backfill_trial.py`: migração manual de contas antigas para trial.
- `seed.py`: contas e dados de demonstração.

## Frontend (`frontend/src/`)

- `App.tsx`: tabela de rotas da aplicação.
- `components/layout/AppShell.tsx`: layout protegido, verificação de e-mail e bloqueio de assinatura.
- `pages/Signup.tsx`: cadastro com CPF/RG e aviso dos 14 dias.
- `pages/Subscription.tsx`: tela de assinatura após expiração do trial.
- `pages/Login.tsx`: entrada na conta.
- `pages/Dashboard.tsx`: painel financeiro.
- `pages/CalendarPage.tsx`: calendário de faturamento.
- `pages/Expenses.tsx`: gerenciamento de despesas.
- `pages/Reports.tsx`: relatórios e exportações.
- `pages/Settings.tsx`: perfil e configurações.
- `pages/Admin.tsx`: painel administrativo.
- `lib/api-client.ts`: cliente HTTP tipado.
- `lib/auth-session.ts`: sessão e usuário atual.
- `lib/data-hooks.ts`: hooks de dados e autenticação.
- `lib/formatters.ts`: dinheiro, datas, percentuais e mensagens.
- `lib/types.ts`: interfaces TypeScript espelhadas do backend.

## Regra para manutenção

Ao alterar um contrato em `backend/models/schemas.py`, atualize a interface correspondente em `frontend/src/lib/types.ts`. Ao criar uma rota, coloque-a no arquivo funcional correspondente e registre o router em `backend/server.py`. Evite colocar lógica financeira em componentes visuais; use os módulos de backend e os hooks de dados.
