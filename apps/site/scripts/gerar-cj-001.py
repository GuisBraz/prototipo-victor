#!/usr/bin/env python3
"""
Gera o desenho técnico FICTÍCIO usado na demonstração do site: public/demos/CJ-001.pdf

Desenho vetorial feito com ReportLab (sem IA e sem serviços externos). Os dados da legenda e da
lista de materiais precisam coincidir com apps/site/src/product-demo/data.ts. Se mudar um, mude o outro.

Uso:  python3 apps/site/scripts/gerar-cj-001.py [caminho-de-saída]
"""
import math
import sys
from pathlib import Path

from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "public/demos/CJ-001.pdf"

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("Tec", str(FONT_DIR / "DejaVuSansCondensed.ttf")))
pdfmetrics.registerFont(TTFont("Tec-B", str(FONT_DIR / "DejaVuSansCondensed-Bold.ttf")))

# ---------------------------------------------------------------- dados (espelham data.ts)
DESENHO = {
    "numero": "CJ-001",
    "revisao": "A",
    "titulo": "CONJUNTO PRINCIPAL DE SUPORTE",
    "tipo": "CONJUNTO MECÂNICO",
    "material": "CONFORME ESPECIFICAÇÃO DO CONJUNTO",
    "projeto": "PR-2026-018 — LINHA DE PRODUÇÃO",
    "unidade": "MILÍMETROS",
    "data": "01/01/2026 (FICTÍCIA)",
    "quantidade": "1",
}
# item, código, descrição, quantidade, material (como escrito no desenho), peso unitário (kg)
PARTES = [
    ("1", "PC-101", "BASE DE FIXAÇÃO", "2", "AÇO CARBONO", "12,50"),
    ("2", "PC-102", "SUPORTE LATERAL", "4", "AÇO CARBONO", "8,20"),
    ("3", "PC-103", "TAMPA", "1", "AÇO INOX.", "5,10"),
    ("4", "PC-104", "EIXO", "1", "AÇO CARBONO", "2,80"),
]
AVISO = "DESENHO FICTÍCIO PARA DEMONSTRAÇÃO — SEM VALIDADE PARA FABRICAÇÃO"

W, H = landscape(A3)  # 420 x 297 mm
INK = (0.07, 0.07, 0.07)
GREY = (0.45, 0.45, 0.45)
LIGHT = (0.86, 0.86, 0.86)

c = canvas.Canvas(str(OUT), pagesize=(W, H))
c.setTitle("CJ-001 — Conjunto principal de suporte (desenho fictício para demonstração)")
c.setAuthor("MECABOM — site de apresentação")
c.setSubject(AVISO)
c.setCreator("apps/site/scripts/gerar-cj-001.py")


# ---------------------------------------------------------------- utilidades
def stroke(width=0.25, color=INK, dash=None):
    c.setLineWidth(width)
    c.setStrokeColorRGB(*color)
    c.setDash(*dash) if dash else c.setDash()


def text(x, y, s, size=7, font="Tec", color=INK, align="l", angle=0):
    c.saveState()
    c.setFillColorRGB(*color)
    c.setFont(font, size)
    c.translate(x, y)
    if angle:
        c.rotate(angle)
    {"l": c.drawString, "c": c.drawCentredString, "r": c.drawRightString}[align](0, 0, s)
    c.restoreState()


def rect(x, y, w, h, width=0.7, fill=True):
    stroke(width)
    c.setFillColorRGB(1, 1, 1)
    c.rect(x, y, w, h, stroke=1, fill=1 if fill else 0)


def line(x1, y1, x2, y2, width=0.25, color=INK, dash=None):
    stroke(width, color, dash)
    c.line(x1, y1, x2, y2)


def centerline(x1, y1, x2, y2):
    line(x1, y1, x2, y2, 0.25, GREY, ([6, 1.5, 1.5, 1.5], 0))


def arrow(x, y, dx, dy):
    """Ponta de seta em (x, y) apontando na direção (dx, dy)."""
    n = math.hypot(dx, dy) or 1
    dx, dy = dx / n, dy / n
    l, w = 2.6, 0.8
    px, py = -dy, dx
    c.setFillColorRGB(*INK)
    p = c.beginPath()
    p.moveTo(x, y)
    p.lineTo(x - dx * l + px * w, y - dy * l + py * w)
    p.lineTo(x - dx * l - px * w, y - dy * l - py * w)
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def dim_h(x1, x2, y_ref, y_dim, label):
    """Cota horizontal entre x1 e x2; y_ref é a aresta medida e y_dim a posição da linha de cota."""
    sign = 1 if y_dim > y_ref else -1
    for x in (x1, x2):
        line(x, y_ref + sign * 1.2, x, y_dim + sign * 1.6, 0.2)
    line(x1, y_dim, x2, y_dim, 0.25)
    arrow(x1, y_dim, 1, 0)
    arrow(x2, y_dim, -1, 0)
    text((x1 + x2) / 2, y_dim + (1.2 if sign > 0 else -3.4), label, 6.5, align="c")


def dim_v(y1, y2, x_ref, x_dim, label):
    sign = 1 if x_dim > x_ref else -1
    for y in (y1, y2):
        line(x_ref + sign * 1.2, y, x_dim + sign * 1.6, y, 0.2)
    line(x_dim, y1, x_dim, y2, 0.25)
    arrow(x_dim, y1, 0, 1)
    arrow(x_dim, y2, 0, -1)
    text(x_dim - 1.2 * sign, (y1 + y2) / 2, label, 6.5, align="c", angle=90)


def balloon(cx, cy, n, tx, ty):
    """Balão numerado com linha de chamada até (tx, ty)."""
    r = 3.6
    d = math.hypot(tx - cx, ty - cy) or 1
    line(cx + (tx - cx) / d * r, cy + (ty - cy) / d * r, tx, ty, 0.3)
    c.setFillColorRGB(1, 1, 1)
    stroke(0.5)
    c.circle(cx, cy, r, stroke=1, fill=1)
    text(cx, cy - 1.7, n, 6.5, "Tec-B", align="c")
    c.setFillColorRGB(*INK)
    c.circle(tx, ty, 0.55, stroke=0, fill=1)


# ---------------------------------------------------------------- geometria do conjunto (mm de modelo)
# Eixos do modelo: X ao longo do eixo (comprimento), Y profundidade, Z altura.
PLACAS = [(0, 160), (200, 360)]  # PC-101 (x0, x1), 160 x 110 x 12
PL_Y, PL_Z = 110, 12
SUP = [(30, 42), (118, 130), (230, 242), (318, 330)]  # PC-102, 12 de espessura
SUP_Y0, SUP_Y1, SUP_Z1 = 25, 85, 102
TAMPA = (30, 130, 25, 85, 102, 110)  # PC-103: x0, x1, y0, y1, z0, z1
EIXO_X0, EIXO_X1, EIXO_Y, EIXO_Z, EIXO_R = 10, 350, 55, 57, 15  # PC-104

# ---------------------------------------------------------------- moldura
M = 10 * mm
line(M, M, W - M, M, 0.9)
line(M, H - M, W - M, H - M, 0.9)
line(M, M, M, H - M, 0.9)
line(W - M, M, W - M, H - M, 0.9)
stroke(0.35)
c.rect(M - 3 * mm, M - 3 * mm, W - 2 * M + 6 * mm, H - 2 * M + 6 * mm, stroke=1, fill=0)
# marcas de zona nas bordas (A–D / 1–8)
cols, rows = 8, 4
for i in range(cols):
    x = M + (W - 2 * M) * (i + 0.5) / cols
    text(x, H - M + 1.2 * mm, str(i + 1), 6, align="c", color=GREY)
    text(x, M - 2.6 * mm, str(i + 1), 6, align="c", color=GREY)
    if i:
        xx = M + (W - 2 * M) * i / cols
        line(xx, H - M, xx, H - M + 2.4 * mm, 0.25)
        line(xx, M, xx, M - 2.4 * mm, 0.25)
for j in range(rows):
    y = M + (H - 2 * M) * (j + 0.5) / rows
    text(M - 2 * mm, y - 2, "DCBA"[j], 6, align="c", color=GREY)
    text(W - M + 2 * mm, y - 2, "DCBA"[j], 6, align="c", color=GREY)

# marca d'água diagonal (clara, não atrapalha a leitura)
c.saveState()
c.setFillColorRGB(0.93, 0.93, 0.93)
c.setFont("Tec-B", 46)
c.translate(W / 2 - 10 * mm, H / 2 + 6 * mm)
c.rotate(22)
c.drawCentredString(0, 0, "DESENHO FICTÍCIO — DEMONSTRAÇÃO")
c.restoreState()

# ---------------------------------------------------------------- vistas 1:2
S = 0.5
FX, FY = 38 * mm, 196 * mm  # origem da vista frontal (X=0, Z=0)
TX, TY = 38 * mm, 95 * mm  # origem da vista superior (X=0, Y=0 na frente)
LX, LY = 238 * mm, 196 * mm  # origem da vista lateral (Y=0, Z=0)


def fx(X):
    return FX + X * S * mm


def fz(Z):
    return FY + Z * S * mm


# --- vista frontal (olhando em +Y): X → direita, Z → cima
text(FX, FY + 69 * mm, "VISTA FRONTAL", 8, "Tec-B")
text(FX + 52 * mm, FY + 69 * mm, "ESC. 1:2", 6.5, color=GREY)
# eixo (atrás), depois suportes, tampa e placas (à frente)
rect(fx(EIXO_X0), fz(EIXO_Z - EIXO_R), (EIXO_X1 - EIXO_X0) * S * mm, 2 * EIXO_R * S * mm, 0.7)
for x0, x1 in SUP:
    rect(fx(x0), fz(PL_Z), (x1 - x0) * S * mm, (SUP_Z1 - PL_Z) * S * mm, 0.7)
rect(fx(TAMPA[0]), fz(TAMPA[4]), (TAMPA[1] - TAMPA[0]) * S * mm, (TAMPA[5] - TAMPA[4]) * S * mm, 0.7)
for x0, x1 in PLACAS:
    rect(fx(x0), fz(0), (x1 - x0) * S * mm, PL_Z * S * mm, 0.7)
# furos de passagem do eixo nos suportes (linhas de centro)
centerline(fx(EIXO_X0 - 8), fz(EIXO_Z), fx(EIXO_X1 + 8), fz(EIXO_Z))
for x0, x1 in SUP:
    centerline(fx((x0 + x1) / 2), fz(PL_Z + 6), fx((x0 + x1) / 2), fz(SUP_Z1 + 2))
# cotas
dim_h(fx(0), fx(360), fz(0), fz(0) - 9 * mm, "360")
dim_h(fx(10), fx(350), fz(EIXO_Z - EIXO_R), fz(0) - 17 * mm, "340")
dim_v(fz(0), fz(110), fx(360), fx(360) + 9 * mm, "110")
dim_v(fz(0), fz(PL_Z), fx(0), fx(0) - 8 * mm, "12")
# balões
balloon(fx(180), fz(48), "1", fx(150), fz(PL_Z))
balloon(fx(180), fz(100), "2", fx(130), fz(88))
balloon(fx(80), fz(110) + 12 * mm, "3", fx(80), fz(106))
balloon(fx(280), fz(98), "4", fx(280), fz(EIXO_Z + EIXO_R))

# --- vista superior (olhando para baixo): X → direita, Y (profundidade) → cima
def ty_(Y):
    return TY + Y * S * mm


def tx_(X):
    return TX + X * S * mm


text(TX, TY + 71 * mm, "VISTA SUPERIOR", 8, "Tec-B")
text(TX + 52 * mm, TY + 71 * mm, "ESC. 1:2", 6.5, color=GREY)
for x0, x1 in PLACAS:
    rect(tx_(x0), ty_(0), (x1 - x0) * S * mm, PL_Y * S * mm, 0.7)
    # furos de fixação Ø14 nos cantos, com linhas de centro
    for hx in (x0 + 20, x1 - 20):
        for hy in (18, PL_Y - 18):
            stroke(0.5)
            c.setFillColorRGB(1, 1, 1)
            c.circle(tx_(hx), ty_(hy), 7 * S * mm, stroke=1, fill=1)
            centerline(tx_(hx) - 6, ty_(hy), tx_(hx) + 6, ty_(hy))
            centerline(tx_(hx), ty_(hy) - 6, tx_(hx), ty_(hy) + 6)
rect(tx_(EIXO_X0), ty_(EIXO_Y - EIXO_R), (EIXO_X1 - EIXO_X0) * S * mm, 2 * EIXO_R * S * mm, 0.7)
for x0, x1 in SUP:
    rect(tx_(x0), ty_(SUP_Y0), (x1 - x0) * S * mm, (SUP_Y1 - SUP_Y0) * S * mm, 0.7)
rect(tx_(TAMPA[0]), ty_(TAMPA[2]), (TAMPA[1] - TAMPA[0]) * S * mm, (TAMPA[3] - TAMPA[2]) * S * mm, 0.7)
centerline(tx_(EIXO_X0 - 8), ty_(EIXO_Y), tx_(EIXO_X1 + 8), ty_(EIXO_Y))
# cotas da vista superior
dim_h(tx_(0), tx_(160), ty_(PL_Y), ty_(PL_Y) + 8 * mm, "160")
dim_h(tx_(160), tx_(200), ty_(PL_Y), ty_(PL_Y) + 8 * mm, "40")
dim_h(tx_(200), tx_(360), ty_(PL_Y), ty_(PL_Y) + 8 * mm, "160")
dim_v(ty_(0), ty_(PL_Y), tx_(0), tx_(0) - 8 * mm, "110")
dim_v(ty_(SUP_Y0), ty_(SUP_Y1), tx_(360), tx_(360) + 9 * mm, "60")
text(tx_(80), ty_(0) - 5 * mm, "4 FUROS Ø14 POR BASE (ITEM 1)", 6.5, align="c")

# --- vista lateral esquerda (olhando em +X): Y → direita, Z → cima
def ly_(Y):
    return LX + Y * S * mm


def lz_(Z):
    return LY + Z * S * mm


text(LX, LY + 69 * mm, "VISTA LATERAL ESQ.", 8, "Tec-B")
text(LX + 50 * mm, LY + 69 * mm, "ESC. 1:2", 6.5, color=GREY)
rect(ly_(0), lz_(0), PL_Y * S * mm, PL_Z * S * mm, 0.7)
rect(ly_(SUP_Y0), lz_(PL_Z), (SUP_Y1 - SUP_Y0) * S * mm, (SUP_Z1 - PL_Z) * S * mm, 0.7)
rect(ly_(TAMPA[2]), lz_(TAMPA[4]), (TAMPA[3] - TAMPA[2]) * S * mm, (TAMPA[5] - TAMPA[4]) * S * mm, 0.7)
stroke(0.7)
c.setFillColorRGB(1, 1, 1)
c.circle(ly_(EIXO_Y), lz_(EIXO_Z), EIXO_R * S * mm, stroke=1, fill=1)
centerline(ly_(EIXO_Y) - 14, lz_(EIXO_Z), ly_(EIXO_Y) + 14, lz_(EIXO_Z))
centerline(ly_(EIXO_Y), lz_(EIXO_Z) - 14, ly_(EIXO_Y), lz_(EIXO_Z) + 14)
dim_h(ly_(0), ly_(110), lz_(0), lz_(0) - 9 * mm, "110")
dim_v(lz_(0), lz_(110), ly_(110), ly_(110) + 9 * mm, "110")
text(ly_(EIXO_Y) + 17, lz_(EIXO_Z) + 14, "Ø30", 6.5)

# --- isométrica esquemática 1:4
K = 0.2 * mm
C30, S30 = math.cos(math.radians(30)), math.sin(math.radians(30))
IX, IY = 346 * mm, 168 * mm


def iso(X, Y, Z):
    return IX + (X - Y) * C30 * K, IY + (Z + (X + Y) * S30) * K


def poly(points, fill=(1, 1, 1), width=0.6):
    stroke(width)
    c.setFillColorRGB(*fill)
    p = c.beginPath()
    p.moveTo(*points[0])
    for pt in points[1:]:
        p.lineTo(*pt)
    p.close()
    c.drawPath(p, stroke=1, fill=1)


def iso_box(x0, x1, y0, y1, z0, z1):
    poly([iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)], (0.97, 0.97, 0.97))  # topo
    poly([iso(x0, y0, z0), iso(x1, y0, z0), iso(x1, y0, z1), iso(x0, y0, z1)], (1, 1, 1))  # frente (Y mín.)
    poly([iso(x0, y0, z0), iso(x0, y1, z0), iso(x0, y1, z1), iso(x0, y0, z1)], (0.9, 0.9, 0.9))  # esquerda (X mín.)


def iso_cylinder_x(x0, x1, yc, zc, r):
    def ring(x):
        return [iso(x, yc + r * math.cos(t), zc + r * math.sin(t)) for t in [i * math.pi / 18 for i in range(36)]]

    a, b = ring(x0), ring(x1)
    px, py = -S30, C30  # direção perpendicular ao eixo na tela

    def extreme(pts, sgn):
        return max(pts, key=lambda p: sgn * (p[0] * px + p[1] * py))

    hi_a, lo_a = extreme(a, 1), extreme(a, -1)
    hi_b, lo_b = extreme(b, 1), extreme(b, -1)
    poly([lo_a, lo_b, hi_b, hi_a], (0.93, 0.93, 0.93), 0.5)
    poly(b, (0.97, 0.97, 0.97), 0.6)
    poly(a, (1, 1, 1), 0.6)


text(IX - 38 * mm, 262 * mm, "VISTA ISOMÉTRICA (ESQUEMÁTICA)", 8, "Tec-B")
text(IX - 38 * mm, 257.5 * mm, "ESC. 1:5", 6.5, color=GREY)
# ordem de fundo para frente: maior X+Y primeiro
iso_box(200, 360, 0, 110, 0, 12)
iso_box(0, 160, 0, 110, 0, 12)
iso_box(318, 330, 25, 85, 12, 102)
iso_box(230, 242, 25, 85, 12, 102)
iso_cylinder_x(EIXO_X0, EIXO_X1, EIXO_Y, EIXO_Z, EIXO_R)
iso_box(118, 130, 25, 85, 12, 102)
iso_box(30, 42, 25, 85, 12, 102)
iso_box(*TAMPA[:2], *TAMPA[2:4], *TAMPA[4:])
for n, (X, Y, Z) in zip("1234", [(150, 0, 12), (236, 25, 80), (80, 25, 110), (330, 55, 72)]):
    px_, py_ = iso(X, Y, Z)
    ox, oy = {"1": (-9, -9), "2": (9, 11), "3": (-9, 11), "4": (-4, 13)}[n]
    balloon(px_ + ox * mm, py_ + oy * mm, n, px_, py_)

# ---------------------------------------------------------------- lista de materiais (acima da legenda)
LMX, LMY = 230 * mm, 72 * mm
cols_w = [12, 22, 48, 12, 38, 38]  # mm
heads = ["ITEM", "CÓDIGO", "DESCRIÇÃO", "QTD", "MATERIAL", "PESO UNIT. (kg)"]
row_h = 7.5 * mm
total_w = sum(cols_w) * mm
text(LMX, LMY + row_h * (len(PARTES) + 1) + 2 * mm, "LISTA DE MATERIAIS", 8, "Tec-B")
for r in range(len(PARTES) + 1):
    y = LMY + row_h * (len(PARTES) - r)
    rect(LMX, y, total_w, row_h, 0.5 if r else 0.8)
    x = LMX
    cells = heads if r == 0 else PARTES[r - 1]
    for i, w in enumerate(cols_w):
        if i:
            line(x, y, x, y + row_h, 0.3)
        al = "c" if i in (0, 3) else ("r" if i == 5 else "l")
        tx = x + (w * mm / 2 if al == "c" else (w * mm - 2.2 * mm if al == "r" else 2.2 * mm))
        text(tx, y + 2.4 * mm, cells[i], 7 if r else 6.5, "Tec-B" if r == 0 else "Tec", align=al)
        x += w * mm
text(LMX, LMY - 4 * mm, "PESO DO CONJUNTO: NÃO DEFINIDO NESTE DESENHO.", 6.5, "Tec-B")
text(LMX, LMY - 7.6 * mm, "ITEM 3: MATERIAL ABREVIADO NO DESENHO — CONFERIR ESPECIFICAÇÃO.", 6.5)

# ---------------------------------------------------------------- notas (canto inferior esquerdo)
NX, NY = 22 * mm, 68 * mm
text(NX, NY, "NOTAS", 8, "Tec-B")
for i, n in enumerate(
    [
        "1. COTAS EM MILÍMETROS.",
        "2. TOLERÂNCIAS GERAIS: ±0,5 (VALOR ILUSTRATIVO).",
        "3. QUEBRAR ARESTAS VIVAS.",
        "4. VISTAS EM PROJEÇÃO DO 1º DIEDRO; ESCALA 1:2 (ISOMÉTRICA 1:5).",
        "5. DOCUMENTO ILUSTRATIVO — NÃO UTILIZAR PARA FABRICAÇÃO.",
    ]
):
    text(NX, NY - 6 * mm - i * 5 * mm, n, 7)

# ---------------------------------------------------------------- legenda (canto inferior direito)
BX, BY, BW, BH = 230 * mm, 14 * mm, 170 * mm, 48 * mm
rect(BX, BY, BW, BH, 1.0)
# faixa de aviso obrigatório
rect(BX, BY + BH - 9 * mm, BW, 9 * mm, 0.8)
c.setFillColorRGB(0.1, 0.1, 0.1)
c.rect(BX, BY + BH - 9 * mm, BW, 9 * mm, stroke=1, fill=1)
text(BX + BW / 2, BY + BH - 6 * mm, AVISO, 8.2, "Tec-B", (1, 1, 1), "c")


def cell(x, y, w, h, label, value, size=8.5, bold=True):
    stroke(0.4)
    c.rect(x, y, w, h, stroke=1, fill=0)
    text(x + 1.5 * mm, y + h - 3.3 * mm, label, 5.2, color=GREY)
    text(x + 1.5 * mm, y + 2.1 * mm, value, size, "Tec-B" if bold else "Tec")


gy = BY + BH - 9 * mm  # topo da área de campos
rh = 9.8 * mm
cell(BX, gy - rh, 104 * mm, rh, "TÍTULO", DESENHO["titulo"], 10)
cell(BX + 104 * mm, gy - rh, 38 * mm, rh, "Nº DO DESENHO", DESENHO["numero"], 11)
cell(BX + 142 * mm, gy - rh, 28 * mm, rh, "REVISÃO", DESENHO["revisao"], 11)
cell(BX, gy - 2 * rh, 104 * mm, rh, "PROJETO", DESENHO["projeto"], 8)
cell(BX + 104 * mm, gy - 2 * rh, 38 * mm, rh, "TIPO", DESENHO["tipo"], 7)
cell(BX + 142 * mm, gy - 2 * rh, 28 * mm, rh, "QUANTIDADE", DESENHO["quantidade"], 9)
cell(BX, gy - 3 * rh, 104 * mm, rh, "MATERIAL", DESENHO["material"], 8)
cell(BX + 104 * mm, gy - 3 * rh, 38 * mm, rh, "PESO", "—", 9)
cell(BX + 142 * mm, gy - 3 * rh, 28 * mm, rh, "FOLHA", "1 / 1", 9)
cell(BX, BY, 38 * mm, gy - 3 * rh - BY, "UNIDADE", DESENHO["unidade"], 7)
cell(BX + 38 * mm, BY, 32 * mm, gy - 3 * rh - BY, "ESCALA", "1:2 (ISO 1:5)", 7)
cell(BX + 70 * mm, BY, 40 * mm, gy - 3 * rh - BY, "DATA", DESENHO["data"], 7)
cell(BX + 110 * mm, BY, 60 * mm, gy - 3 * rh - BY, "ORIGEM", "DEMONSTRAÇÃO MECABOM — DADOS ILUSTRATIVOS", 5.2, False)

c.showPage()
c.save()
print(f"PDF gerado em {OUT} ({OUT.stat().st_size} bytes)")
