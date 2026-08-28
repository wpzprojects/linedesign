"""Genera los assets de icono de la PWA a partir del logo fuente
(assets/Logo.jfif): los iconos cuadrados del manifest (192/512) tal cual,
y una versión recortada al círculo con fondo transparente (logo-mark.png)
para usarla dentro de la UI (barra de actividad), donde un fondo blanco
cuadrado desentonaría con el tema oscuro.
"""
from PIL import Image, ImageDraw
import numpy as np
import os

SOURCE = 'assets/Logo.jfif'

os.makedirs('assets', exist_ok=True)

source = Image.open(SOURCE).convert('RGB')

for size in (192, 512):
    source.resize((size, size), Image.LANCZOS).save(f'assets/icon-{size}.png')

# Recorte a círculo: el logo ya trae una insignia circular sobre fondo
# blanco solido — se detecta ese fondo por flood-fill desde las 4 esquinas
# (en vez de asumir un círculo geométrico perfecto) y se vuelve transparente.
work = source.copy()
for corner in [(0, 0), (work.width - 1, 0), (0, work.height - 1), (work.width - 1, work.height - 1)]:
    ImageDraw.floodfill(work, corner, (0, 255, 0), thresh=40)
arr = np.array(work)
is_background = (arr[:, :, 0] == 0) & (arr[:, :, 1] == 255) & (arr[:, :, 2] == 0)
alpha = np.where(is_background, 0, 255).astype('uint8')
rgba = np.dstack([np.array(source), alpha])
mark = Image.fromarray(rgba, 'RGBA')
mark.resize((256, 256), Image.LANCZOS).save('assets/logo-mark.png')

print('icons created')
