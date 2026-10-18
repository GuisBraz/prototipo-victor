#!/usr/bin/env python3
"""Converte um desenho em PNG no PDF de demonstração (página única, sem perda, sem texto selecionável).

Uso: python3 apps/site/scripts/png-para-pdf.py <entrada.png> <saida.pdf> [título]
Usado para public/demos/EG-001.pdf (desenho da engrenagem enviado pelo responsável pelo projeto).
"""
import sys
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

src, dst = sys.argv[1], sys.argv[2]
title = sys.argv[3] if len(sys.argv) > 3 else "Desenho de demonstração"
im = Image.open(src).convert("RGB")
w_px, h_px = im.size
DPI = 150  # largura física = pixels / DPI
w, h = w_px / DPI * 72, h_px / DPI * 72
c = canvas.Canvas(dst, pagesize=(w, h), pageCompression=1)
c.setTitle(title)
c.setAuthor("MECABOM — demonstração")
c.drawImage(ImageReader(im), 0, 0, width=w, height=h)
c.showPage()
c.save()
print(f"{dst}: {w:.0f}x{h:.0f} pt")
