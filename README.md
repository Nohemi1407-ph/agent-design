# Agent Design

Constructor de carruseles y posts de Instagram potenciado por IA.
Repositorio educativo creado por **Nohemi Pirela** para sus estudiantes.

![dashboard](docs/screenshots/dashboard.png)

---

## ¿Qué hace?

- Diseña carruseles de Instagram conversando con un agente de IA
- Sube imágenes de referencia y el agente imita ese estilo
- Configura tu marca (colores, tipografía, logo) y todos los slides la usan
- Exporta el carrusel completo como PNGs listos para subir

Construido con **Next.js 16 + React 19 + TypeScript + Tailwind v4**, con tema oscuro y acento violeta.

---

## Requisitos previos

Antes de empezar necesitas tener instalado en tu computadora:

1. **Node.js 20 o superior** — [descárgalo aquí](https://nodejs.org/)
2. **Git** — [descárgalo aquí](https://git-scm.com/)
3. **Claude Code CLI** — el cerebro de IA detrás del chat
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```
   Luego ejecuta `claude` una vez en tu terminal para autenticarte con tu cuenta.

---

## Clonar y correr — paso a paso

### 1. Clona el repositorio
```bash
git clone <URL-del-repo> agent-design
cd agent-design
```

### 2. Instala dependencias
```bash
npm install
```

### 3. Levanta el servidor de desarrollo
```bash
npm run dev
```

### 4. Abre el navegador
```
http://localhost:3000
```

La primera vez te pedirá configurar tu marca (nombre, colores, fuentes). Después podrás crear tu primer carrusel.

---

## Cómo usar la app

1. **Configura tu marca** — al abrir por primera vez
2. **Crea un carrusel nuevo** — botón "New Carousel", elige proporción (1:1, 4:5 o 9:16)
3. **Sube imágenes de referencia** (opcional) — el AI estudiará su estilo
4. **Habla con el AI Co-Creator** — *"crea un carrusel de 6 slides sobre [tu tema]"*
5. **Revisa, ajusta y exporta** a PNG

---

## Estructura del proyecto

```
src/
├── app/                     # Rutas Next.js (App Router)
│   ├── api/                # Endpoints del backend
│   ├── carousel/[id]/      # Página del editor
│   └── page.tsx            # Dashboard principal
├── components/              # Componentes React
│   ├── brand/              # Configuración de marca
│   ├── chat/               # Panel del AI Co-Creator
│   ├── editor/             # Vista del carrusel + slides
│   ├── layout/             # TopBar, etc.
│   └── ui/                 # Botones, dialogs, inputs
├── lib/                     # Lógica de negocio
│   ├── carousels.ts        # CRUD de carruseles
│   ├── data.ts             # Storage en JSON con locks
│   ├── chat-system-prompt.ts  # Prompt que recibe el AI
│   └── slide-html.ts       # Render del HTML de cada slide
└── types/                   # Tipos TypeScript
```

Los datos se guardan localmente en `data/*.json` y las imágenes subidas en `public/uploads/`.

---

## Scripts disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en localhost:3000 |
| `npm run build` | Build de producción |
| `npm run start` | Correr el build de producción |
| `npm run lint` | Revisar errores de lint |
| `npm run setup` | Script auxiliar de setup |
| `npm run doctor` | Diagnóstico del entorno |

---

## Ejercicios sugeridos para estudiantes

A medida que avanzamos en el curso iremos construyendo encima de esta base:

1. **Personalizar la identidad visual** — cambiar tema, tipografía, logo
2. **Agregar plantillas propias** al sistema de templates
3. **Conectar una API de generación de imágenes** (ej. GPT Image 2, Imagen, Flux)
4. **Implementar publicación directa a Instagram** vía Meta Graph API
5. **Migrar el storage** de JSON local a una base de datos (Postgres / Supabase)
6. **Desplegar en Railway o Vercel** para tener tu propia app live

---

## Créditos

Fork con rediseño visual y enfoque educativo basado en [open-carrusel](https://github.com/Hainrixz/open-carrusel) (MIT).
