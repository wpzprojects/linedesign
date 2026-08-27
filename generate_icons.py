from PIL import Image, ImageDraw
import os

os.makedirs('assets', exist_ok=True)

for size in (192, 512):
    img = Image.new('RGBA', (size, size), (15, 23, 42, 255))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((24, 24, size - 24, size - 24), radius=size // 10, fill=(37, 99, 235, 255))
    draw.text((size // 2, size // 2), 'LD', anchor='mm', fill=(255, 255, 255, 255), font_size=size // 3)
    img.save(f'assets/icon-{size}.png')

print('icons created')
