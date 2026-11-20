"""Envio de e-mails via integração Resend gerenciada pela Emergent.

- Remetente (nome) vem de EMAIL_FROM_NAME; o endereço é gerenciado pela plataforma.
- Destinatário, assunto e HTML NUNCA vêm do navegador: sempre de templates no servidor
  e do e-mail cadastrado do próprio usuário (evita "open relay").
- Cada envio gera um registro em `email_logs` SEM conteúdo financeiro (só tipo/status).
"""

import asyncio
import base64
import ipaddress
import logging
import os
import re
import uuid
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from lib.database import db
from lib.security import mask_email, now_utc

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"  # constante (não vem do ambiente)
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "MotorCaixa")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
APP_URL = os.environ.get("APP_URL", "").rstrip("/")

# Domínios reservados (RFC 2606) usados em contas de demonstração: nunca enviamos para eles.
RESERVED_DOMAINS = ("example.com", "example.org", "example.net")


class EmailError(Exception):
    def __init__(self, code: str, transient: bool):
        super().__init__(code)
        self.code = code
        self.transient = transient


# ---------------- Guardrail (verificação estrutural do HTML) ----------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


# ---------------- Envio ----------------
async def _log(kind: str, to: str, status: str, error: str | None = None, user_id: str | None = None) -> None:
    await db.email_logs.insert_one({
        "id": str(uuid.uuid4()), "kind": kind, "to_masked": mask_email(to), "user_id": user_id,
        "status": status, "error": error, "created_at": now_utc(),
    })


async def _post(payload: dict) -> httpx.Response:
    async with httpx.AsyncClient(timeout=30) as client:
        return await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                 headers={"X-Email-Key": EMAIL_KEY}, json=payload)


async def send_email(*, kind: str, to: str, subject: str, html: str, user_id: str | None = None,
                     attachment: tuple[str, bytes] | None = None) -> bool:
    """Envia um e-mail. Retorna True se o anexo foi incluído (ou não havia anexo).

    Tentativas controladas: até 3 para falhas temporárias (rede/5xx), com espera crescente.
    Falhas de cobrança da plataforma (402/403/409) não são repetidas.
    """
    if to.lower().endswith(tuple("@" + d for d in RESERVED_DOMAINS)):
        await _log(kind, to, "failed", "dominio_reservado_demo", user_id)
        raise EmailError("dominio_reservado_demo", transient=False)
    _assert_safe_email(subject, html)
    payload: dict = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    if attachment:
        payload["attachments"] = [{"filename": attachment[0], "content": base64.b64encode(attachment[1]).decode()}]

    last_code = "erro_desconhecido"
    for attempt in range(3):
        try:
            resp = await _post(payload)
            if resp.status_code < 300:
                await _log(kind, to, "sent", None, user_id)
                return "attachments" in payload or attachment is None
            try:
                code = resp.json().get("code", "") or f"http_{resp.status_code}"
            except ValueError:
                code = f"http_{resp.status_code}"
            if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
                logger.warning("Email pausado: %s", code)
                await _log(kind, to, "failed", code, user_id)
                raise EmailError(code, transient=False)
            if resp.status_code in (400, 422) and "attachments" in payload:
                # O provedor recusou o anexo: reenviamos sem anexo (o HTML já orienta
                # a baixar a planilha no app, com login).
                payload.pop("attachments")
                continue
            last_code = code
            if resp.status_code < 500:
                break
        except httpx.HTTPError:
            last_code = "falha_de_rede"
        await asyncio.sleep(2 ** attempt)
    await _log(kind, to, "failed", last_code, user_id)
    raise EmailError(last_code, transient=True)


# ---------------- Templates (fixos, no servidor) ----------------
def _wrap(title: str, body_html: str) -> str:
    brand = escape(EMAIL_FROM_NAME)
    return (
        '<table role="presentation" width="100%" style="background:#0B111E;padding:24px 0">'
        '<tr><td align="center"><table role="presentation" width="560" style="background:#ffffff;'
        'border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">'
        f'<tr><td style="padding:24px 28px 8px"><strong style="font-size:18px;color:#059669">{brand}</strong>'
        f'<h1 style="font-size:20px;margin:16px 0 8px">{escape(title)}</h1></td></tr>'
        f'<tr><td style="padding:0 28px 24px;font-size:15px;line-height:1.55">{body_html}'
        f'<p style="font-size:12px;color:#64748b;margin-top:28px">Enviado por {brand}. '
        'Nunca pedimos sua senha por e-mail. Se você não reconhece esta mensagem, ignore-a.</p>'
        '</td></tr></table></td></tr></table>'
    )


def _button(url: str, label: str) -> str:
    return (f'<p style="margin:24px 0"><a href="{escape(url)}" style="background:#10B981;color:#042F2E;'
            f'padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">{escape(label)}</a></p>')


def verify_email_html(name: str, token: str) -> tuple[str, str]:
    url = f"{APP_URL}/verificar-email?token={token}"
    body = (f"<p>Olá, {escape(name)}!</p><p>Para ativar sua conta, confirme este endereço de e-mail. "
            "O link vale por 24 horas e só pode ser usado uma vez.</p>" + _button(url, "Confirmar meu e-mail"))
    return f"Confirme seu e-mail no {EMAIL_FROM_NAME}", _wrap("Confirme seu e-mail", body)


def reset_password_html(name: str, token: str) -> tuple[str, str]:
    url = f"{APP_URL}/redefinir-senha?token={token}"
    body = (f"<p>Olá, {escape(name)}.</p><p>Recebemos um pedido para redefinir sua senha. "
            "O link vale por 60 minutos e só pode ser usado uma vez. Se não foi você, ignore este e-mail.</p>"
            + _button(url, "Criar nova senha"))
    return f"Redefinição de senha no {EMAIL_FROM_NAME}", _wrap("Redefinir senha", body)


def account_exists_html(name: str) -> tuple[str, str]:
    url = f"{APP_URL}/entrar"
    body = (f"<p>Olá, {escape(name)}.</p><p>Alguém tentou criar uma conta com este e-mail, mas você já "
            "possui cadastro. Se foi você, basta entrar. Esqueceu a senha? Use a opção de recuperação.</p>"
            + _button(url, "Entrar na minha conta"))
    return f"Tentativa de cadastro no {EMAIL_FROM_NAME}", _wrap("Você já tem uma conta", body)


def monthly_report_html(name: str, period_label: str, has_data: bool, attached: bool) -> tuple[str, str]:
    url = f"{APP_URL}/app/relatorios"
    if has_data:
        msg = ("<p>Seu relatório financeiro de <strong>" + escape(period_label) + "</strong> está pronto.</p>"
               + ("<p>A planilha Excel (.xlsx) está anexada a este e-mail. Ela contém informações financeiras "
                  "pessoais: guarde-a com cuidado e evite encaminhá-la.</p>" if attached else
                  "<p>Por segurança, a planilha não foi anexada. Você pode baixá-la no app, após fazer login.</p>"))
    else:
        msg = ("<p>Não encontramos lançamentos de faturamento ou despesas em <strong>" + escape(period_label)
               + "</strong>. Por isso, não geramos planilha neste mês.</p>")
    body = (f"<p>Olá, {escape(name)}!</p>{msg}<p>Os valores refletem apenas o que você registrou e não "
            "representam apuração contábil ou fiscal.</p>" + _button(url, "Abrir meus relatórios")
            + '<p style="font-size:12px;color:#64748b">Você pode desativar este envio automático em Ajustes.</p>')
    # Assunto identifica o período e NÃO expõe valores.
    return f"Seu relatório mensal de {period_label} - {EMAIL_FROM_NAME}", _wrap("Relatório financeiro mensal", body)
