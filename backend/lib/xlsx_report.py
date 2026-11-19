"""Geração da planilha mensal (.xlsx) com openpyxl.

Recebe SOMENTE o id do usuário dono; todos os dados vêm de consultas filtradas por ele.
Abas: Resumo, Faturamento diário, Despesas, Por categoria.
"""

import io
from datetime import date, datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from lib.finance import fetch_days, fetch_expenses, month_bounds, month_label, period_summary

BRL = '"R$" #,##0.00'
HEAD_FILL = PatternFill("solid", fgColor="0B111E")
HEAD_FONT = Font(bold=True, color="FFFFFF")
STATUS_LABEL = {"trabalhado": "Trabalhado", "folga": "Folga / zero informado",
                "sem_registro": "Sem registro", "futuro": "-"}


def _header(ws, row: int, values: list[str]) -> None:
    for i, v in enumerate(values, start=1):
        c = ws.cell(row=row, column=i, value=v)
        c.fill, c.font = HEAD_FILL, HEAD_FONT
        c.alignment = Alignment(horizontal="center")


def _widths(ws, widths: list[int]) -> None:
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


async def build_month_xlsx(user: dict, month: str, today: str) -> tuple[bytes, bool]:
    """Retorna (bytes da planilha, houve_lançamentos)."""
    uid = user["id"]
    start, end = month_bounds(month)
    s = await period_summary(uid, start, end, today)
    days = await fetch_days(uid, start, end)
    expenses = await fetch_expenses(uid, start, end)
    has_data = bool(days or expenses)

    wb = Workbook()
    ws = wb.active
    ws.title = "Resumo"
    ws["A1"] = "Relatório financeiro mensal"
    ws["A1"].font = Font(bold=True, size=14)
    rows = [
        ("Motorista", user["name"]),
        ("Perfil", "Carro" if user["vehicle_type"] == "carro" else "Moto"),
        ("Período", f"{month_label(month)} (01 a {end[8:]})"),
        ("Gerado em", datetime.now().strftime("%d/%m/%Y %H:%M")),
    ]
    for i, (k, v) in enumerate(rows, start=3):
        ws.cell(row=i, column=1, value=k).font = Font(bold=True)
        ws.cell(row=i, column=2, value=v)
    r = 8
    for label, cents in (("Faturamento total", s.revenue_cents), ("Despesas totais", s.expense_cents),
                         ("Resultado operacional estimado", s.result_cents)):
        ws.cell(row=r, column=1, value=label).font = Font(bold=True)
        ws.cell(row=r, column=2, value=cents / 100).number_format = BRL
        r += 1
    for label, val in (("Dias trabalhados", s.worked_days), ("Dias de folga / zero informado", s.off_days),
                       ("Dias sem registro", s.no_record_days)):
        ws.cell(row=r, column=1, value=label).font = Font(bold=True)
        ws.cell(row=r, column=2, value=val)
        r += 1
    if s.km_total > 0:  # indicador só aparece quando há dados de km
        ws.cell(row=r, column=1, value="Km rodados informados").font = Font(bold=True)
        ws.cell(row=r, column=2, value=s.km_total)
        ws.cell(row=r + 1, column=1, value="Custo por km").font = Font(bold=True)
        ws.cell(row=r + 1, column=2, value=(s.cost_per_km_cents or 0) / 100).number_format = BRL
        r += 2
    r += 1
    _header(ws, r, ["Faturamento por fonte", "Valor"])
    for t in s.by_source:
        r += 1
        ws.cell(row=r, column=1, value=t.name)
        ws.cell(row=r, column=2, value=t.cents / 100).number_format = BRL
    r += 2
    ws.cell(row=r, column=1, value="Observação: 'Sem registro' significa que nada foi lançado no dia; "
                                   "não presumimos folga. O resultado não representa lucro contábil ou fiscal.")
    _widths(ws, [38, 30])

    # --- Faturamento diário (uma coluna por fonte) ---
    wd = wb.create_sheet("Faturamento diário")
    sources = list(dict.fromkeys(en["source_name"] for d in days for en in d["entries"]))
    _header(wd, 1, ["Data", "Situação", *sources, "Total do dia", "Km"])
    day_map = {d["date"]: d for d in days}
    row = 1
    for p in s.daily:
        if p.status == "futuro":
            continue
        row += 1
        d = day_map.get(p.date)
        wd.cell(row=row, column=1, value=date.fromisoformat(p.date)).number_format = "DD/MM/YYYY"
        wd.cell(row=row, column=2, value=STATUS_LABEL[p.status])
        amounts = {en["source_name"]: en["amount_cents"] for en in (d["entries"] if d else [])}
        for j, src in enumerate(sources, start=3):
            if d:
                wd.cell(row=row, column=j, value=amounts.get(src, 0) / 100).number_format = BRL
        tot = wd.cell(row=row, column=3 + len(sources), value=(p.revenue_cents / 100) if d else None)
        tot.number_format = BRL
        wd.cell(row=row, column=4 + len(sources), value=(d.get("km") if d else None))
    row += 1
    wd.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
    col = 3 + len(sources)
    total_cell = wd.cell(row=row, column=col, value=f"=SUM({get_column_letter(col)}2:{get_column_letter(col)}{row - 1})")
    total_cell.number_format, total_cell.font = BRL, Font(bold=True)
    _widths(wd, [13, 24, *[14] * len(sources), 15, 8])

    # --- Despesas ---
    we = wb.create_sheet("Despesas")
    _header(we, 1, ["Data", "Categoria", "Descrição", "Tipo", "Valor", "Observações"])
    kind = {"diaria": "Diária", "mensal": "Mensal", "eventual": "Eventual"}
    for i, e in enumerate(expenses, start=2):
        we.cell(row=i, column=1, value=date.fromisoformat(e["date"])).number_format = "DD/MM/YYYY"
        we.cell(row=i, column=2, value=e["category_name"])
        we.cell(row=i, column=3, value=e["description"])
        we.cell(row=i, column=4, value=kind.get(e["kind"], e["kind"]))
        we.cell(row=i, column=5, value=e["amount_cents"] / 100).number_format = BRL
        we.cell(row=i, column=6, value=e.get("notes", ""))
    last = len(expenses) + 2
    we.cell(row=last, column=4, value="TOTAL").font = Font(bold=True)
    c = we.cell(row=last, column=5, value=f"=SUM(E2:E{last - 1})" if expenses else 0)
    c.number_format, c.font = BRL, Font(bold=True)
    _widths(we, [13, 30, 36, 11, 14, 30])

    # --- Por categoria ---
    wc = wb.create_sheet("Por categoria")
    _header(wc, 1, ["Categoria", "Valor"])
    for i, t in enumerate(s.by_category, start=2):
        wc.cell(row=i, column=1, value=t.name)
        wc.cell(row=i, column=2, value=t.cents / 100).number_format = BRL
    _widths(wc, [36, 16])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue(), has_data
