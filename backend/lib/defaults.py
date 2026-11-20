"""Fontes de renda e categorias padrão por perfil (carro / moto) e configuração de planos."""

CAR_SOURCES = [("uber", "Uber"), ("99", "99"), ("particular", "Particular")]
MOTO_SOURCES = [("ifood", "iFood"), ("uber", "Uber"), ("99", "99"), ("particular", "Particular")]

COMMON_CATEGORIES = [
    ("combustivel", "Combustível"), ("manutencao", "Manutenção"), ("pneus", "Pneus e peças"),
]
CAR_CATEGORIES = COMMON_CATEGORIES + [
    ("oleo", "Óleo e lubrificantes"), ("alimentacao", "Alimentação"),
    ("estacionamento", "Estacionamento e pedágio"), ("seguro", "Seguro"),
    ("financiamento", "Financiamento ou aluguel do veículo"),
    ("documentacao", "Documentação, IPVA e licenciamento"), ("internet", "Internet e telefone"),
    ("lavagem", "Lavagem e higienização"), ("outras", "Outras despesas"),
]
MOTO_CATEGORIES = COMMON_CATEGORIES + [
    ("oleo", "Óleo e kit relação"), ("alimentacao", "Alimentação"),
    ("equipamentos", "Equipamentos (capacete, baú, capa)"), ("seguro", "Seguro"),
    ("financiamento", "Financiamento ou aluguel da moto"),
    ("documentacao", "Documentação, IPVA e licenciamento"), ("internet", "Internet e telefone"),
    ("estacionamento", "Estacionamento"), ("outras", "Outras despesas"),
]


def default_sources(vehicle: str) -> list[dict]:
    items = MOTO_SOURCES if vehicle == "moto" else CAR_SOURCES
    return [{"id": i, "name": n, "active": True, "builtin": True} for i, n in items]


def default_categories(vehicle: str) -> list[dict]:
    items = MOTO_CATEGORIES if vehicle == "moto" else CAR_CATEGORIES
    return [{"id": i, "name": n, "active": True, "builtin": True} for i, n in items]


def merge_defaults(current: list[dict], defaults: list[dict]) -> list[dict]:
    """Ao trocar de perfil, acrescenta itens padrão que faltam sem apagar os do usuário."""
    ids = {c["id"] for c in current}
    return current + [d for d in defaults if d["id"] not in ids]


# Preços são hipóteses comerciais: ficam no banco (coleção app_config) e o admin pode
# alterá-los. Estes valores só são usados se ainda não houver configuração salva.
DEFAULT_CONFIG = {"pro_price_cents": 1990, "trial_days": 14}
PLAN_FEATURES = {
    "free": ["Calendário de faturamento", "Controle de despesas", "Dashboard mensal",
             "Relatório mensal em Excel por e-mail"],
    "pro": ["Tudo do Gratuito", "Despesas recorrentes ilimitadas", "Relatórios por período e CSV",
            "Indicadores por km rodado", "Suporte prioritário"],
}
