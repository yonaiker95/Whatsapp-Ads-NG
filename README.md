# WhatsApp Ads System

Sistema de gestión de campañas de marketing para WhatsApp. Permite administrar instancias de WhatsApp conectadas a través de la **Evolution API**, crear campañas de mensajería masiva a grupos, gestionar plantillas de mensajes, respuestas automáticas y un chatbot conversacional con IA, todo orquestado con **n8n** y respaldado por **PostgreSQL**.

## Características

- **Instalador de primer arranque (setup wizard)**: en la primera ejecución el sistema detecta que no está instalado, redirige a `/setup` y guía la configuración del entorno, la conexión a PostgreSQL, los servicios externos (Evolution API y n8n) y la creación de la cuenta de administrador.
- **Autenticación**: registro y acceso con sesiones protegidas por cookies y token CSRF, validación del número de WhatsApp por **OTP** y verificación en dos pasos (2FA) opcional.
- **Verificación por OTP de WhatsApp**: el número de teléfono se valida enviando un código de 6 dígitos por WhatsApp (`/api/auth/phone/send-code`). El registro, el restablecimiento de contraseña y el cambio de número lo requieren. Los códigos se envían **solo desde instancias del administrador** (las de los miembros nunca envían códigos).
- **Verificación en dos pasos (2FA)**: al iniciar sesión, si el usuario la tiene activa y su número está verificado, el sistema envía un código a su WhatsApp antes de completar el acceso.
- **Organizaciones y equipo**: crea una organización, invita miembros con acceso a la cuenta y concede a cada uno **permisos por módulo** (instancias, campañas, plantillas, grupos, auto-respuestas, chatbot, centro de IA, reportes, facturación, organización, envío manual). El backend bloquea (`403`) los módulos no concedidos y el sidebar oculta las secciones sin permiso.
- **Instancias de WhatsApp**: alta, baja, conexión por código QR y sincronización con Evolution API.
- **Teléfono automático**: el número real de cada instancia se obtiene de Evolution API al conectar la sesión (campo `ownerJid`), sin entrada manual.
- **Centro de IA**: configuración de proveedores de IA (Gemini, OpenAI, Claude, DeepSeek, Mistral, OpenRouter, Azure) en modo SaaS o BYOK, con validación, cuota mensual, auditoría y log de uso.
- **Chatbot con IA**: prompt de sistema configurable por instancia, pausa por conversación, y respuestas generadas por el AI Center y entregadas por n8n.
- **Orquestación n8n**: cada instancia recibe automáticamente su propio workflow/webhook dinámico (`dm-chatbot-<id>`) sobre un único entorno n8n administrado por el sistema.
- **Campañas**: creación, programación, envío masivo a grupos con control de concurrencia y log de resultados.
- **Plantillas de mensajes**: texto, multimedia y variables.
- **Grupos**: sincronización automática desde las instancias conectadas.
- **Respuestas automáticas**: reglas de respuesta ante palabras clave.
- **Conversaciones**: historial de mensajes entrantes por contacto.
- **Reportes y métricas**: estadísticas de envíos y rendimiento en el panel principal.
- **Páginas institucionales**: legal, privacidad, términos, cookies, seguridad y RGPD.

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Frontend | Angular 19 (standalone), Angular Material, SCSS |
| Backend | Node.js (HTTP nativo) |
| Base de datos | PostgreSQL 16 |
| Mensajería WhatsApp | Evolution API |
| Automatización | n8n (provisionado dinámico por instancia) |
| IA | Proveedores externos vía `providers/` (SaaS o BYOK) |
| Cache | Redis |

## Requisitos previos

- [Node.js](https://nodejs.org) 18 o superior
- [Docker](https://www.docker.com) y Docker Compose
- [Angular CLI](https://angular.dev/tools/cli) 19

## Instalación

```bash
# 1. Clonar el repositorio
git clone <repositorio> whatsapp-ads-angular
cd whatsapp-ads-angular

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de variables de entorno
cp .env.example .env

# 4. Levantar la infraestructura (PostgreSQL, Evolution API, Redis, n8n)
docker compose up -d

# 5. Compilar e iniciar el servidor de producción
npm run build
npm run serve
```

La aplicación queda disponible en `http://localhost:3000`.

### Primer arranque (instalador)

Al iniciar el servidor por primera vez (sin marca de instalación en `data/setup.json` ni usuarios en la base de datos), la aplicación redirige automáticamente a `http://localhost:3000/setup`, donde el **instalador** guía:

1. **Base de datos**: conexión y prueba a PostgreSQL (la app crea el esquema automáticamente).
2. **Servicios externos**: URLs y API keys de Evolution API y n8n, con prueba de conexión.
3. **Cuenta de administrador**: nombre, correo, contraseña y WhatsApp (opcional, con OTP).
4. **Instalación**: escribe el `.env`, inicializa la base de datos, crea el administrador y marca el sistema como instalado.

> Si la base de datos ya tiene usuarios pero no existe `data/setup.json` (migración), el sistema se auto-marca como instalado con `legacy:true` y conserva los usuarios existentes.

## Despliegue con Docker

El proyecto incluye un `Dockerfile` (multi-stage: compila Angular y ejecuta el backend) y el servicio `app` en `docker-compose.yml`. Todo el stack (PostgreSQL, Evolution API, Redis, n8n y la app) se levanta con:

```bash
docker compose up -d --build
```

La aplicación queda en `http://localhost:3000`. En el primer arranque sin `data/setup.json` el **instalador** (`/setup`) guía la configuración (la BD ya queda apuntando al contenedor `postgres`, así que basta completar el wizard con el host `postgres`).

Configuración mediante `.env` (misma sintaxis que `.env.example`):

| Variable | Descripción |
|----------|-------------|
| `APP_URL` | URL pública (por defecto `http://localhost:3000`) |
| `SESSION_SECRET` | Secreto de sesión (cambiar en producción) |
| `AI_ENC_KEY` | Clave maestra de cifrado de API keys de IA |
| `EVOLUTION_API_KEY` | API Key de Evolution API |
| `N8N_API_KEY` | API Key de n8n (X-N8N-API-KEY) para aprovisionar workflows |
| `EVO_WEBHOOK_URL` | URL del webhook de Evolution hacia la app (solo si la app corre en el host) |
| `N8N_WEBHOOK_URL` | URL pública de n8n (solo si la app corre en el host) |

**Dos modos de ejecución:**

- **Todo en Docker** (por defecto): `docker compose up -d --build` levanta la app en el contenedor. Las URLs entre contenedores las define el compose (`app:3000`, `evolution_api:8080`, `n8n:5678`).
- **App en el host + infraestructura en Docker**: inicia solo la infraestructura (`docker compose up -d postgres evolution_postgres evolution_redis evolution_api n8n`) y ejecuta la app con `npm run serve`, agregando a `.env`:
  ```
  EVO_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks
  N8N_WEBHOOK_URL=http://host.docker.internal:3000
  ```

**Persistencia**: los datos quedan en volúmenes de Docker (`postgres_data`, `n8n_data`, `app_data` para la marca de instalación `data/setup.json`, etc.). La app usa sesiones en memoria; no la escales a varias réplicas sin un almacén de sesiones compartido.

## Ejecución en desarrollo

```bash
npm start
```

Levanta el servidor de desarrollo de Angular en `http://localhost:4200`. Las peticiones a `/api` se redirigen al backend mediante el proxy definido en `proxy.conf.js`.

> Para desarrollo es necesario tener el backend corriendo (`npm run serve`) o un servidor de API en el puerto indicado en `proxy.conf.js`.

## Variables de entorno

Copia `.env.example` a `.env` y ajusta los valores (o usa el **instalador** de `/setup`, que los escribe por ti). Las más relevantes:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `SESSION_SECRET` | Secreto de sesión (base de cifrado si no hay `AI_ENC_KEY`) |
| `EVOLUTION_API_URL` | URL de Evolution API |
| `EVOLUTION_API_KEY` | API Key de Evolution API |
| `N8N_URL` | URL de n8n (entorno único del sistema) |
| `N8N_API_KEY` | API Key de n8n (X-N8N-API-KEY). Ver `DOCUMENTACION.md` |
| `N8N_APP_URL` | URL con la que n8n llama a la app (`http://host.docker.internal:3000`) |
| `N8N_EVOLUTION_URL` | URL de Evolution visible desde el contenedor n8n (`http://evolution_api:8080`) |
| `AI_ENC_KEY` | Clave maestra de cifrado de API keys de IA |
| `PORT` | Puerto del backend (3000) |

## Credenciales

La cuenta de administrador **se crea durante el instalador** (`/setup`), no viene sembrada por defecto. Las credenciales de la instancia de desarrollo de referencia son:

| Recurso | URL | Usuario | Contraseña |
|---------|-----|---------|------------|
| Aplicación | http://localhost:3000 | admin@whatsapp-ads.com | admin123 |
| Evolution API | http://localhost:3100 | API Key | evolution_api_7465829274 |
| n8n | http://localhost:5678 | admin@whatsapp-ads.com | Admin123 |
| PostgreSQL (app) | localhost:5432 | postgres | postgres |

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm start` | Servidor de desarrollo de Angular (puerto 4200) |
| `npm run build` | Compilación de producción de Angular |
| `npm run serve` | Inicia el backend Node.js (puerto 3000) |
| `npm run watch` | Compilación continua en modo desarrollo |
| `npm run dev` | Servidor de desarrollo Node (dev.js) |
| `npm run prod` | Servidor de producción Node (prod.js) |

## Estructura del proyecto

```
whatsapp-ads-angular/
├── src/
│   └── app/
│       ├── core/          # Servicios, modelos, guardas e interceptores
│       ├── layout/        # Layout principal de la aplicación (header, sidebar, footer)
│       ├── modules/       # Funcionalidad (instancias, campañas, ai-center, chatbot, auth, setup, etc.)
│       ├── shared/        # Componentes compartidos (country-code-selector, otp-input, etc.)
│       └── app.routes.ts  # Definición de rutas
├── providers/             # Proveedores de IA (interfaz IAProvider)
├── security/              # Cifrado de API keys y validación de formatos
├── server.js              # Backend Node.js (API + estáticos + webhooks)
├── proxy.conf.js          # Proxy de desarrollo
├── docker-compose.yml     # Infraestructura en Docker
├── n8n-workflows/         # Flujos de n8n exportados (referencia)
├── data/                  # Runtime: marca de instalación (data/setup.json)
└── .env.example           # Variables de entorno de referencia
```

## Documentación

Ver [DOCUMENTACION.md](DOCUMENTACION.md) para la documentación técnica completa: arquitectura, base de datos (incluye el **diagrama entidad-relación**), endpoints de la API, contenedores Docker, orquestación dinámica con n8n, Centro de IA y resolución de problemas.

## Créditos

Proyecto elaborado por **Yonaiker Peralta** (V-22357130) y **Greimar Marin** (V-29686611).
