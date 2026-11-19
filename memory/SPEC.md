# MotorCaixa — SPEC (living spec)

SaaS de controle financeiro para motoristas autônomos (carro: Uber/99/Particular; moto: iFood/Uber/99/Particular).
UI em pt-BR, BRL, mobile-first (bottom nav no celular, sidebar no desktop), tema escuro.

## Stack
FastAPI + Motor/MongoDB (backend/), React 19 + Vite + Tailwind v4 + shadcn (frontend/). Todas as rotas em /api.
E-mail: Resend gerenciado pela Emergent (lib/mailer.py). Agendador: .emergent/crons.yml -> POST /api/cron/daily.

## Auth & papéis
- Cadastro: nome, e-mail, senha (>=8, letras+números), tipo carro|moto. Resposta genérica (não revela e-mail existente).
- Conta nasce com e-mail PENDENTE. Link /verificar-email?token=... (token aleatório, SHA-256 no banco, 24h, uso único,
  vinculado ao endereço). Login é permitido, mas rotas financeiras exigem e-mail confirmado (403) e a UI mostra a tela
  "Confirme seu e-mail" (reenviar com limite 1/min e 5/h; corrigir e-mail em Ajustes).
- Sessão: cookie httpOnly `mc_session` (Secure, SameSite=Lax, 7 dias), token opaco com hash na coleção sessions.
  Usuário é relido a cada requisição (desativar conta/mudar papel tem efeito imediato).
- Recuperação: /esqueci-senha -> link /redefinir-senha?token= (60 min, uso único) -> derruba todas as sessões.
- Papéis: user | admin (`users.role`). Admin acessa /app/admin e /api/admin/*. Admin não pode remover o próprio acesso.
- Rate limit (coleção rate_limits, janela fixa): login, signup, forgot, resend, envio de relatório.

## Isolamento
Toda consulta financeira filtra por `user_id` do servidor (nunca do navegador). Registro de outro usuário -> 404.
Admin vê tudo via /api/admin/* (acesso a detalhes é registrado em audit_logs).

## Modelo de dados (Mongo)
- users {id, name, email(unique), password_hash(bcrypt), vehicle_type, verified_email, role, plan free|pro,
  status active|disabled, timezone, report_opt_in, report_attach, is_demo, income_sources[], expense_categories[]}
- days {user_id, date, day_off, km, notes, entries[{source_id, source_name, amount_cents}], total_cents} unique(user_id,date)
  Sem documento = "sem registro"; day_off ou total 0 = "folga/zero informado".
- expenses {id, user_id, date, category_id, category_name, description, amount_cents, kind diaria|mensal|eventual,
  notes, recurring_id, competence} unique parcial (user_id, recurring_id, competence).
- recurring {id, user_id, description, category_id, amount_cents, day_of_month 1-28, active, last_generated_month}
- report_runs {id, user_id, period, trigger auto|manual|admin, trigger_key, status, attempts, error, email_masked,
  with_attachment} unique(user_id, period, trigger_key) -> idempotência do envio automático.
- email_logs (sem conteúdo), audit_logs, sessions, tokens, rate_limits, cron_runs, app_config (preço Pro, trial).
Valores sempre em centavos (int).

## Fluxos
- Calendário: PUT /api/days/{date} (upsert, sem duplicar), DELETE; datas futuras bloqueadas.
- Despesas CRUD + recorrentes (gera 1x/mês no vencimento; não gera se já houver lançamento manual igual no mês).
- Dashboard: hoje/mês, resultado, comparação mês anterior, gráficos, alertas (dias sem registro, recorrentes).
- Relatórios: período (mês, anterior, 3 meses, personalizado), por fonte/categoria/semana, dias, km; CSV; XLSX mensal
  (abas Resumo, Faturamento diário, Despesas, Por categoria); reenvio manual (3/h).
- Cron diário 11:00 UTC (08:00 BRT): gera recorrentes; dias 1-5 processa o relatório do mês anterior para usuários
  ativos, confirmados e com opt-in. Até 3 tentativas para falhas temporárias. Domínios example.* nunca recebem e-mail.
- Admin: stats, usuários (ativar/desativar, plano, papel, marcar e-mail confirmado, enviar relatório), lote mensal,
  logs de envio/e-mail, auditoria, preço do plano Pro.
- Planos: Free/Pro exibidos, preço configurável pelo admin. SEM cobrança (billing_enabled=false).

## Seed (python seed.py) — ver memory/test_credentials.md
admin@motorcaixa.com.br (admin), carlos.demo@example.com (carro), renata.demo@example.com (moto), ~49 dias de dados
demo (domingos = folga; 3 e 4 dias atrás = sem registro), regra recorrente "Plano de celular" dia 10.
