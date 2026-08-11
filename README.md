# WhatsApp Ads System

Sistema de gestión de campañas de marketing para WhatsApp. Permite administrar instancias de WhatsApp conectadas a través de la **Evolution API**, crear campañas de mensajería masiva a grupos, gestionar plantillas de mensajes, respuestas automáticas y un chatbot conversacional con IA, todo orquestado con **n8n** y respaldado por **PostgreSQL**.

## Características

- **Instalador de primer arranque (setup wizard)**: en la primera ejecución el sistema detecta que no está instalado, redirige a `/setup` y guía la configuración del entorno, la conexión a PostgreSQL, los servicios externos (Evolution API y n8n) y la creación de la cuenta de administrador.
- **Autenticación**: registro y acceso con sesiones protegidas por cookies y token CSRF, validación del número de WhatsApp por **OTP** y verificación en dos pasos (2FA) opcional.
- **Verificación por OTP de WhatsApp**: el número de teléfono se valida enviando un código de 6 dígitos por WhatsApp (`/api/auth/phone/send-code`). El registro, el restablecimiento de contraseña y el cambio de número lo requieren. Los códigos se envían **solo desde las instancias que el administrador habilita como "emisoras de seguridad"** (`security_sender`); las demás nunca envían códigos.
- **Verificación en dos pasos (2FA)**: al iniciar sesión, si el usuario la tiene activa y su número está verificado, el sistema envía un código a su WhatsApp antes de completar el acceso.
- **Organizaciones y equipo**: crea una organización, invita miembros con acceso a la cuenta y concede a cada uno **permisos por módulo** (instancias, campañas, plantillas, grupos, auto-respuestas, chatbot, centro de IA, reportes, facturación, organización, envío manual). El backend bloquea (`403`) los módulos no concedidos y el sidebar oculta las secciones sin permiso.
- **Onboarding obligatorio**: tras registrarse, el asistente guía la creación de la organización (el primer usuario queda como **propietario/owner**) o la unión a la existente; no se puede usar el panel sin completarlo. El administrador global está exento.
- **Usuarios del sistema y bloqueo en cascada**: cada usuario ve a los miembros de su organización y el administrador global gestiona a los propietarios. Al bloquear a un propietario (o ante **falta de pago** de su organización) se bloquea automáticamente a todos sus miembros, y el desbloqueo los restaura.
- **Instancias de WhatsApp**: alta, baja, conexión por código QR y sincronización con Evolution API.
- **Teléfono automático**: el número real de cada instancia se obtiene de Evolution API al conectar la sesión (campo `ownerJid`), sin entrada manual.
- **Centro de IA**: configuración de proveedores de IA (Gemini, OpenAI, Claude, DeepSeek, Mistral, OpenRouter, Azure) en modo SaaS o BYOK, con validación, cuota mensual, auditoría y log de uso.
- **Chatbot con IA**: prompt de sistema configurable por instancia, pausa por conversación, y respuestas generadas por el AI Center y entregadas por n8n.
- **Datos del negocio desde Google**: cada instancia conecta **su propia cuenta de Google** (OAuth) y el bot lee **en vivo** su hoja de cálculo (catálogo y precios), documentos de Google y agenda (Google Calendar) al responder — sin copiar nada.
- **Orquestación n8n**: cada instancia recibe automáticamente su propio workflow/webhook dinámico (`dm-chatbot-<id>`) sobre un único entorno n8n administrado por el sistema.
- **Campañas**: creación y edición con programación mediante calendario y reloj (fecha/hora de envío), recurrencia con ventana diaria (hora de inicio/fin con validación), envío masivo a grupos con control de concurrencia y log de resultados. Las campañas programadas se envían automáticamente mediante un **cron interno del contenedor** (`CAMPAIGN_CRON`, cada minuto), sin depender de n8n ni de conexiones externas.
- **Botones interactivos en campañas**: las plantillas admiten hasta 3 botones (respuesta/URL). Con la **Cloud API oficial de Meta** se envían como mensaje interactivo; en cuentas **QR (Baileys)** se degradan a una caja de texto con formato código (Meta los bloquea por esa vía). Cada envío se registra en `message_logs` para las métricas del panel.
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

# 4. Levantar la infraestructura (PostgreSQL, Evolution API, Redis y n8n).
#    NOTA: se levantan solo estos servicios; la app corre en el host (paso 5).
#    Para ejecutar todo dentro de Docker, ver "Despliegue con Docker".
docker compose up -d postgres evolution_postgres evolution_redis evolution_api n8n

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

El proyecto incluye un `Dockerfile` **multi-stage** (compila Angular y ejecuta el backend) y el servicio `app` en `docker-compose.yml`. Todo el stack (PostgreSQL, Evolution API, Redis, n8n y la app) se levanta con:

```bash
docker compose up -d --build
```

La aplicación queda en `http://localhost:3000`. En el primer arranque sin `data/setup.json` el **instalador** (`/setup`) guía la configuración (la BD ya queda apuntando al contenedor `postgres`, así que basta completar el wizard con el host `postgres`).

| Contenedor | Imagen | Puerto | Propósito |
|------------|--------|--------|-----------|
| `whatsapp_ads_app` | whatsapp-ads:latest (build `./Dockerfile`) | 3000 | Aplicación completa (frontend compilado + backend Node.js, healthcheck en `/api/setup/status`) |
| `whatsapp_ads_postgres` | postgres:16 | 5432 | Base de datos de la aplicación |
| `evolution_api` | evoapicloud/evolution-api | 3100 | API de mensajería WhatsApp |
| `n8n` | n8nio/n8n | 5678 | Automatización de flujos (entorno único) |
| `evolution_postgres` / `evolution_redis` | postgres:16 / redis | interno | BD y cache internas de Evolution API |

Configuración mediante `.env` (misma sintaxis que `.env.example`; el compose la inyecta al contenedor `app`):

| Variable | Descripción |
|----------|-------------|
| `APP_URL` | URL pública (por defecto `http://localhost:3000`) |
| `SESSION_SECRET` | Secreto de sesión (cambiar en producción) |
| `AI_ENC_KEY` | Clave maestra de cifrado de API keys de IA |
| `EVOLUTION_API_KEY` | API Key de Evolution API |
| `N8N_API_KEY` | API Key de n8n (X-N8N-API-KEY) para aprovisionar workflows |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth de Google (datos del negocio en vivo por instancia). También configurables desde el panel: Centro de IA → Google OAuth (admin) |
| `CAMPAIGN_CRON` | Expresión cron del envío automático de campañas (por defecto `* * * * *`) |
| `EVO_WEBHOOK_URL` | URL del webhook de Evolution hacia la app (solo si la app corre en el host) |
| `N8N_WEBHOOK_URL` | URL pública de n8n (solo si la app corre en el host) |

**Dos modos de ejecución:**

- **Todo en Docker** (por defecto): `docker compose up -d --build` levanta la app en el contenedor. Las URLs entre contenedores las define el compose (`app:3000`, `evolution_api:8080`, `n8n:5678`).
- **App en el host + infraestructura en Docker**: inicia solo la infraestructura (`docker compose up -d postgres evolution_postgres evolution_redis evolution_api n8n`) y ejecuta la app con `npm run serve`, agregando a `.env`:
  ```
  EVO_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks
  N8N_WEBHOOK_URL=http://host.docker.internal:3000
  ```

**Persistencia**: los datos quedan en volúmenes de Docker (`postgres_data`, `n8n_data`, `evolution_postgres_data`, `evolution_redis_data`, `evolution_api_instances` y `app_data` para la marca de instalación `data/setup.json`). Al eliminar con `docker compose down -v` se pierden los datos. La app usa sesiones en memoria; no la escales a varias réplicas sin un almacén de sesiones compartido.

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
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth de Google (datos del negocio en vivo por instancia). También configurables desde el panel (Centro de IA → Google OAuth). Ver `DOCUMENTACION.md` |
| `PORT` | Puerto del backend (3000) |
| `CAMPAIGN_CRON` | Expresión cron del envío automático de campañas programadas (por defecto cada minuto, `* * * * *`) |

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
├── google.js              # Integración OAuth con Google (fuentes en vivo por instancia)
├── proxy.conf.js          # Proxy de desarrollo
├── Dockerfile             # Imagen multi-stage (compila Angular + backend Node.js)
├── docker-compose.yml     # Infraestructura en Docker + servicio app
├── n8n-workflows/         # Flujos de n8n exportados (referencia)
├── data/                  # Runtime: marca de instalación (data/setup.json)
└── .env.example           # Variables de entorno de referencia
```

## Documentación

Ver [DOCUMENTACION.md](DOCUMENTACION.md) para la documentación técnica completa: arquitectura, base de datos (incluye el **diagrama entidad-relación**), endpoints de la API, contenedores Docker, orquestación dinámica con n8n, Centro de IA y resolución de problemas.

## Créditos

Proyecto elaborado por **Yonaiker Peralta** (V-22357130) y **Greimar Marin** (V-29686611).
