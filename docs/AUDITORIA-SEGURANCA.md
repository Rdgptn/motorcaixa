# Auditoria de segurança — atualização de trial e assinatura

## Alterações aplicadas

O backend agora coleta CPF ou RG no cadastro, normaliza o valor, valida CPF com dígitos verificadores, calcula um fingerprint HMAC com segredo externo e cria um índice MongoDB único. O documento puro não é retornado pela API. O cadastro inicia trial de 14 dias e grava o status `trialing`.

As rotas financeiras usam a dependência `require_verified`, que agora exige e-mail confirmado e trial vigente ou assinatura ativa. Após a expiração, a API responde `402` e mantém disponíveis apenas sessão, perfil, planos e checkout. Admins permanecem capazes de operar para suporte.

Foi adicionada integração Stripe por checkout redirecionado e webhook assinado. O webhook usa o identificador do provedor para idempotência, atualiza `subscription_status` e nunca recebe cartão no backend.

## Pontos auditados

A checagem de unicidade foi desenhada para não revelar se um documento já possui conta: a resposta de cadastro permanece genérica. O índice único também cobre corrida entre dois cadastros simultâneos. O `backend/.env` original contém credenciais e não deve ser incluído no ZIP ou versionado; o pacote final deve conter apenas `.env.example`.

## Pendências antes de produção

É necessário configurar `DOCUMENT_HASH_SECRET`, Stripe, CORS restrito e cookies HTTPS. É necessário testar migração de usuários existentes: contas antigas precisam receber `trial_ends_at` e `subscription_status` por uma rotina controlada. Também é necessário revisar retenção, exclusão de conta e aviso de privacidade conforme LGPD, além de validar cobrança aprovada, recusada, cancelada, inadimplência, renovação e chargeback.

A regra impede o mesmo fingerprint de documento, mas não prova que duas pessoas usando CPF e RG diferentes são a mesma pessoa. Para isso seria necessária uma etapa de verificação de identidade autorizada; não deve ser implementada por consulta pública improvisada.
