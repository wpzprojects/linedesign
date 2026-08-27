# LineDesign HTML

Aplicación web tipo PWA para emular el flujo central de diseño de líneas de transmisión en una fase inicial con datos simulados.

## Estado actual

- Fase 1 en progreso
- Alineación simulada cargada
- Vista en planta implementada
- Vista en perfil implementada
- PWA básica configurada con manifest y service worker

## Cómo ejecutar

Se recomienda servir la carpeta con un servidor local estático, por ejemplo:

```bash
cd "d:\OneDrive - CELSIA S.A E.S.P\10 General\00 IA\01 VSC\LineDesing_HTML"
python -m http.server 8000
```

Luego abrir en el navegador:

```text
http://localhost:8000/
```

Esto habilita la instalación como PWA en navegadores modernos porque la app se sirve desde localhost y el service worker puede registrarse correctamente.

## Consideraciones PWA

- `manifest.webmanifest` define la instalación.
- `sw.js` cachea los assets principales para funcionamiento offline.
- Cuando se agreguen nuevos assets (mapas, librerías, etc.), deben registrarse en el service worker.
- Para una versión final, conviene revisar la estrategia de actualización del caché.

## Estructura del proyecto

- `src/data` — datos de prueba y modelo inicial
- `src/engine` — lógica geométrica y de cálculo
- `src/ui` — render de vistas
- `public` y `assets` — recursos estáticos para la PWA

## Próximo paso

- construir catálogo de estructuras
- agregar edición de alineación por drag
- definir hipótesis de carga y catenaria
