# Documentación Técnica — WhatsApp Ads System

## 1. Resumen

**WhatsApp Ads System** es una aplicación web para la gestión de campañas de marketing por WhatsApp. El sistema se compone de:

- **Frontend**: aplicación web desarrollada en Angular 19 (standalone).
- **Backend**: servidor Node.js que expone una API REST, sirve la aplicación compilada y recibe webhooks de Evolution API.
- **Instalador de primer arranque**: en la primera ejecución, un wizard (`/setup`) configura el entorno, prueba la base de datos y los servicios externos y crea la cuenta de administrador.
- **Autenticación con OTP por WhatsApp**: validación del número de teléfono (registro, restablecimiento de contraseña, cambio de número) y verificación en dos pasos (2FA) opcional.
- **Centro de IA**: módulo de configuración de proveedores de IA (SaaS o BYOK) que genera las respuestas del chatbot.
- **Infraestructura**: PostgreSQL, Redis, Evolution API y n8n ejecutados en contenedores Docker.
- **Onboarding obligatorio**: al registrarse, el asistente guía la creación de la organización (el primer usuario queda como propietario) o la unión a la existente; no se puede usar el panel sin completarlo (el admin global está exento).
- **Usuarios y bloqueo en cascada**: cada usuario ve a los miembros de su organización y el administrador global gestiona a los propietarios; bloquear a un propietario (o la falta de pago de su organización) bloquea automáticamente a todos sus miembros.

El flujo del chatbot conversacional es **n8n → app (AI Center) → Evolution**: n8n recibe el DM entrante en un webhook dinámico por instancia, la app genera la respuesta con la configuración del Centro de IA y n8n la envía de vuelta por Evolution API.

## 2. Arquitectura

```
                    ┌──────────────────────────────┐
                    │       Navegador web          │
                    │   (Angular - frontend)       │
                    └──────────────┬───────────────┘
                                   │  HTTP (REST)
                                   ▼
                    ┌──────────────────────────────────────┐
                    │         Backend (server.js)          │
                    │     Node.js HTTP + PostgreSQL        │
                    └───────┬──────────────────┬───────────┘
                            │                  │
              ┌─────────────▼───┐    ┌─────────▼────────────┐
              │  Evolution API  │    │        n8n           │
              │   (WhatsApp)    │    │ (entorno único)      │
              └───────┬─────────┘    └─────────┬────────────┘
                      │                        │
              ┌───────▼───────┐     ┌──────────▼─────────┐
              │    Redis      │     │      PostgreSQL    │
              │  (cache/cola) │     │ (app + Evolution)  │
              └───────────────┘     └────────────────────┘
```

**Flujo del chatbot (DM → n8n → IA → Evolution):**

```
Usuario (WhatsApp)
    │ mensaje privado
    ▼
Evolution API ──webhook──► Backend (handleWebhook)
    │                            │
    │                            ▼
    │                   handleN8nChatbot(instance, sender, name, content)
    │                            │ (valida chatbot activo y no pausado)
    │                            ▼
    │                   ensureN8nWorkflow(instance)   → workflow dinámico
    │                            │                       dm-chatbot-<id>
    │                            ▼
    │                   POST {n8n}/webhook/dm-chatbot-<id>
    │                            │ payload { instanceId, sender, content, apiKey }
    │                            ▼
    │                   Workflow n8n
    │                    1. Parse Payload
    │                    2. POST {app}/api/ai/chatbot-reply  (header apikey)
    │                            │
    │                            ▼
    │                   Backend: generateChatbotReply (AI Center: cuota,
    │                            auditoría, proveedor SaaS/BYOK)
    │                            ▲
    │                            │ { reply }
    │                   Workflow n8n
    │                    3. POST {evolution}/message/sendText/<instance>
    │                            │
    ▼────────────────────────────┘
Usuario (WhatsApp) recibe la respuesta
```

El frontend consume la API del backend, que se comunica con la **Evolution API** para gestionar instancias (códigos QR, envío de mensajes, estado de conexión, webhooks) y con **n8n** para la orquestación dinámica de cada instancia.

## 3. Puertos y URLs de acceso

| Componente | URL | Puerto | Credenciales |
|------------|-----|--------|--------------|
| Aplicación (producción, contenedor `app`) | http://localhost:3000 | 3000 | admin@whatsapp-ads.com / admin123 |
| Aplicación (desarrollo) | http://localhost:4200 | 4200 | — |
| Evolution API | http://localhost:3100 | 3100 | API Key: evolution_api_7465829274 |
| n8n | http://localhost:5678 | 5678 | admin@whatsapp-ads.com / Admin123 |
| PostgreSQL (app) | localhost:5432 | 5432 | postgres / postgres |
| PostgreSQL (Evolution) | interno Docker | 5432 | evolution_user / evolution_password |
| Redis (Evolution) | interno Docker | 6379 | sin autenticación |

## 4. Contenedores Docker

Definidos en `docker-compose.yml`. El servicio `app` (la aplicación completa) se construye localmente con el `Dockerfile` multi-stage; el resto son imágenes públicas:

| Contenedor | Imagen | Puerto host → contenedor | Propósito |
|------------|--------|--------------------------|-----------|
| `whatsapp_ads_postgres` | postgres:16 | 5432 → 5432 | Base de datos de la aplicación |
| `evolution_postgres` | postgres:16 | interno | Base de datos interna de Evolution API |
| `evolution_redis` | redis:latest | interno | Cache y cola de Evolution API |
| `evolution_api` | evoapicloud/evolution-api | 3100 → 8080 | API de mensajería WhatsApp |
| `n8n` | n8nio/n8n | 5678 → 5678 | Automatización de flujos |
| `whatsapp_ads_app` | whatsapp-ads:latest (build `./Dockerfile`) | 3000 → 3000 | Aplicación: frontend Angular compilado + backend Node.js |

### Dockerfile multi-stage (`./Dockerfile`)

- **Stage `build`** (`node:20-alpine`): instala dependencias (`npm ci --legacy-peer-deps`) y compila el frontend con `npm run build -- --configuration production`.
- **Stage `runtime`** (`node:20-alpine`): instala solo dependencias de producción (`npm ci --omit=dev`), copia el backend (`server.js`, `google.js`, `providers/`, `security/`) y el frontend compilado (`dist/`), instala `tzdata` para la zona horaria correcta y expone el puerto 3000.
- **Healthcheck**: verifica `GET /api/setup/status` cada 30s (marca la instalación como sana cuando el backend responde).
- La marca de instalación se guarda en `/app/data/setup.json`, montado como volumen `app_data`.

### Levantar todo el stack

```bash
# Compila la imagen de la app y levanta todo (PostgreSQL, Evolution, n8n y la app)
docker compose up -d --build
```

La aplicación queda en `http://localhost:3000`. En el primer arranque sin `data/setup.json`, el **instalador** (`/setup`) guía la configuración (la BD ya apunta al contenedor `postgres`, así que basta completar el wizard con el host `postgres`). Las variables del entorno de la app (`APP_URL`, `SESSION_SECRET`, `AI_ENC_KEY`, `EVOLUTION_API_KEY`, `N8N_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `CAMPAIGN_CRON`, etc.) se inyectan desde el `.env` del proyecto (ver `docker-compose.yml`, servicio `app`).

**Volúmenes de persistencia**: `postgres_data`, `evolution_postgres_data`, `evolution_redis_data`, `evolution_api_instances`, `n8n_data` y `app_data` (marca de instalación). Al eliminar con `docker compose down -v` se pierden los datos.

### Comandos útiles

```bash
# Levantar toda la infraestructura (sin reconstruir la imagen de la app)
docker compose up -d

# Reconstruir y levantar solo la aplicación
docker compose up -d --build app

# Levantar solo la base de datos de la aplicación
docker compose up -d postgres

# Detener todos los contenedores
docker compose down

# Ver los registros de un contenedor
docker compose logs -f evolution_api
docker compose logs -f app

# Eliminar contenedores y volúmenes (pierde los datos)
docker compose down -v
```

### Configuración de Evolution API

Las variables principales del contenedor:

| Variable | Valor |
|----------|-------|
| `DATABASE_ENABLED` | true |
| `DATABASE_PROVIDER` | postgresql |
| `DATABASE_CONNECTION_URI` | postgresql://evolution_user:evolution_password@evolution_postgres:5432/evolution?schema=public |
| `CACHE_REDIS_ENABLED` | true |
| `CACHE_REDIS_URI` | redis://evolution_redis:6379/6 |
| `AUTHENTICATION_TYPE` | apikey |
| `AUTHENTICATION_API_KEY` | evolution_api_7465829274 |
| `SERVER_PORT` | 8080 |
| `WEBHOOK_GLOBAL_URL` | `http://app:3000/api/webhooks` (contenedor `app`); en modo "app en el host", sobreescribir con `EVO_WEBHOOK_URL=http://host.docker.internal:3000/api/webhooks` |

Los eventos configurados para el webhook global son:
`CONNECTION_UPDATE`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE` y `MESSAGES_DELETE`.

## 5. Variables de entorno

Definidas en `.env` (ver `.env.example` para la referencia):

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | postgresql://postgres:postgres@localhost:5432/whatsapp_ads |
| `SESSION_SECRET` | Secreto para las sesiones | cambiar-en-produccion |
| `APP_URL` | Dominio público de la aplicación (CORS) | http://localhost:4200 |
| `EVOLUTION_API_URL` | URL de Evolution API | http://localhost:3100 |
| `EVOLUTION_API_KEY` | API Key de Evolution API | evolution_api_7465829274 |
| `N8N_URL` | URL de n8n (entorno único del sistema) | http://localhost:5678 |
| `N8N_BASIC_AUTH_USER` | Usuario de n8n (interfaz) | admin@whatsapp-ads.com |
| `N8N_BASIC_AUTH_PASSWORD` | Contraseña de n8n (interfaz) | Admin123 |
| `N8N_API_KEY` | API Key de n8n (X-N8N-API-KEY) para aprovisionar workflows | — |
| `N8N_APP_URL` | URL con la que n8n llama de vuelta a la app | http://host.docker.internal:3000 |
| `N8N_EVOLUTION_URL` | URL de Evolution visible desde el contenedor n8n | http://evolution_api:8080 |
| `AI_ENC_KEY` | Clave maestra de cifrado de API keys de IA | cambiar-en-produccion-clave-maestra-ia |
| `GEMINI_API_KEY` | Clave para el chatbot (legacy) | — |
| `GOOGLE_CLIENT_ID` | Client ID de OAuth de Google (conectar la cuenta de Google de cada instancia para leer hojas/documentos/agenda en vivo) | — |
| `GOOGLE_CLIENT_SECRET` | Client Secret de OAuth de Google | — |
| `GOOGLE_REDIRECT_URI` | URL de retorno del OAuth (opcional; por defecto `{APP_URL}/api/chatbot/google/callback`) | — |
| `PORT` | Puerto del backend | 3000 |
| `API_TARGET` | Destino del proxy en desarrollo | http://localhost:3000 |
| `API_PORT` | Puerto de la API para el proxy | 3000 |

> El **instalador** (`/setup`) escribe estas variables en `.env` durante el primer arranque (conexión a PostgreSQL, URLs y API keys de Evolution/n8n) y crea la cuenta de administrador.

> **n8n es un entorno único global.** La URL y la API key se toman únicamente de las variables de entorno del sistema (`N8N_URL`, `N8N_API_KEY`); no se persiste ni se acepta configuración n8n por instancia.

## 6. Base de datos

El esquema se crea automáticamente al iniciar el backend (`server.js`). Tablas:

| Tabla | Descripción |
|-------|-------------|
| `users` | Usuarios del sistema (rol, organización, `onboarding_completed` y permisos por módulo) |
| `instances` | Instancias de WhatsApp (URL de Evolution, API Key, estado, teléfono, rol de verificación, tipo de integración `integration`: Cloud API vs Baileys) |
| `groups_` | Grupos sincronizados por instancia |
| `templates` | Plantillas de mensajes (contenido, variables) |
| `campaigns` | Campañas de envío (programación, recurrencia, métricas) |
| `send_logs` | Registro de resultados de cada envío |
| `message_logs` | Mensajes enviados y recibidos |
| `auto_replies` | Reglas de respuesta automática |
| `chatbot_configs` | Configuración del chatbot por instancia (prompt, activo, conocimiento: empresa, precios, calendario) |
| `chatbot_paused` | Conversaciones pausadas del chatbot |
| `conversations` | Conversaciones entrantes por instancia (último mensaje, no leídos, archivado) |
| `bot_documents` | Documentos del bot (RAG): texto que alimenta al chatbot por instancia; `source` indica su origen (`manual`/`sheet`/`docs`/`calendar`) |
| `bot_document_chunks` | Fragmentos de cada documento con sus embeddings (búsqueda semántica) |
| `google_connections` | Conexión OAuth de la cuenta de Google **por instancia** (tokens cifrados) |
| `instance_google_sources` | Fuentes de Google de cada instancia que alimentan al bot en vivo: hoja de cálculo (`sheet_id`, `sheet_name`, `sheet_range`), documentos (`doc_ids`) y calendario (`calendar_id`, `calendar_days`) |
| `ai_configs` | Configuración de IA por usuario (modo SaaS/BYOK, proveedor, modelo) |
| `ai_saas_keys` | Claves de sistema (modo SaaS) administradas por el admin |
| `ai_usage_logs` | Registro de consumo de IA (tokens, costo, estado) |
| `ai_audit_logs` | Auditoría de acciones de IA (guardado, rotación, validación) |
| `otp_codes` | Códigos de verificación por WhatsApp (OTP) por teléfono, propósito y estado |
| `sessions` | Sesiones activas (cookie de sesión) |
| `user_block_audit` | Auditoría de bloqueos/desbloqueos realizados por el propietario |
| `organizations` | Organizaciones (inquilinos) |
| `plans` | Planes de suscripción |
| `plan_addons` | Complementos por plan |
| `user_addons` | Complementos activados por usuario |
| `invoices` | Facturas |
| `payment_destinations` | Destinos de pago configurados |
| `payment_methods` | Métodos de pago |
| `reported_payments` | Pagos reportados |
| `testimonials` | Testimonios (páginas institucionales) |

### Códigos OTP (`otp_codes`)

Campos principales: `phone` (sin `+`), `code`, `purpose`, `token` (solo login/restablecimiento), `attempts`, `used`, `expires_at`, `consumed_at`.

- **Validez**: 10 minutos (`OTP_TTL_MS`). **Reenvío**: 1 por minuto por teléfono+propósito (`OTP_RESEND_MS`). **Intentos**: máximo 5 por código (`OTP_MAX_ATTEMPTS`); al superarlos el código se invalida.
- **Propósitos**: `register`, `login`, `password_reset`, `notification`, `phone_update`.
- **Consumo**: los flujos finales (registro, cambio de teléfono, inicio de sesión con 2FA) **consumen** el código (`used = true`); la validación previa del sexto dígito (`/api/auth/phone/verify`) **no lo consume**.

### Relaciones principales

- Un **usuario** tiene muchas **instancias**.
- Una **instancia** tiene muchos **grupos**, **campañas**, **mensajes**, **auto-respuestas**, una **configuración de chatbot**, una **conexión de Google** (`google_connections`) y sus **fuentes de Google** (`instance_google_sources`).
- Una **plantilla** se utiliza en muchas **campañas**.
- Una **campaña** pertenece a una **instancia** y puede usar una **plantilla**.
- Los **logs de envío** y los **mensajes** pertenecen a una campaña o instancia.
- Un **usuario** tiene una **configuración de IA** (`ai_configs`) y su historial en `ai_usage_logs` / `ai_audit_logs`.
- Una **organización** tiene un **propietario** (`organizations.owner_id`) y muchos **miembros** (usuarios con `organization_id`).

### Diagrama entidad-relación (E-R)

Diagrama derivado de las claves foráneas del esquema (definido en `server.js`). Notación *crow's foot*: `||` = uno, `o{` = cero o muchos, `o|` = cero o uno.

```mermaid
erDiagram
    organizations ||--o{ users : "members (organization_id)"
    organizations ||--o| users : "owner (owner_id)"
    users ||--o{ sessions : "user_id"
    users ||--o{ invoices : "user_id"
    users ||--o{ payment_methods : "user_id"
    users ||--o{ instances : "user_id"
    users ||--o{ templates : "user_id"
    users ||--o{ reported_payments : "user_id"
    users ||--o{ user_addons : "user_id"
    users ||--o| ai_configs : "user_id (1:1)"
    users ||--o{ ai_usage_logs : "user_id"
    users ||--o{ ai_audit_logs : "user_id"
    instances ||--o{ groups_ : "instance_id"
    instances ||--o{ campaigns : "instance_id"
    instances ||--o{ message_logs : "instance_id"
    instances ||--o{ auto_replies : "instance_id"
    instances ||--o| chatbot_configs : "instance_id (1:1)"
    instances ||--o{ chatbot_paused : "instance_id"
    instances ||--o{ conversations : "instance_id"
    instances ||--o{ bot_documents : "instance_id"
    instances ||--o| google_connections : "instance_id (1:1)"
    instances ||--o| instance_google_sources : "instance_id (1:1)"
    users ||--o{ google_connections : "user_id"
    templates ||--o{ campaigns : "template_id"
    campaigns ||--o{ send_logs : "campaign_id"
    campaigns ||--o{ message_logs : "campaign_id"
    bot_documents ||--o{ bot_document_chunks : "document_id"
    auto_replies ||--o| bot_documents : "document_id (opcional)"

    users {
        text id PK
        text email UK
        text name
        text password_hash
        text role
        text[] permissions
        text organization_id FK
        text plan
        text phone
        boolean phone_verified
        boolean two_factor_enabled
        boolean onboarding_completed
        boolean blocked
        datetime blocked_at
        text blocked_reason
    }
    organizations {
        text id PK
        text name
        text description
        text owner_id FK
    }
    otp_codes {
        text id PK
        text phone
        text code
        text purpose
        text token
        int attempts
        boolean used
        datetime expires_at
    }
    invoices {
        text id PK
        text number
        numeric amount
        text status
        text user_id FK
        datetime due_date
    }
    payment_methods {
        text id PK
        text user_id FK
        text type
        text brand
        text last4
    }
    sessions {
        text id PK
        text user_id FK
        text email
        text role
        datetime expires_at
    }
    instances {
        text id PK
        text name
        text evolution_url
        text api_key
        text phone
        text status
        text user_id FK
        text evolution_instance_id
        text verification_role
        boolean security_sender
        text integration
    }
    groups_ {
        text id PK
        text instance_id FK
        text jid
        text name
        int participants
        boolean excluded
    }
    templates {
        text id PK
        text name
        text user_id FK
        text category
        jsonb content
        text[] variables
        text preview
    }
    campaigns {
        text id PK
        text name
        text status
        boolean active
        text template_id FK
        text instance_id FK
        datetime scheduled_at
        text recurrence
        time start_time
        time end_time
        int interval_value
        text interval_unit
        int concurrence
        text[] group_ids
        text[] tags
        text[] exclude_tags
        int total_sent
        int total_failed
    }
    send_logs {
        text id PK
        text campaign_id FK
        int sent
        int failed
    }
    message_logs {
        text id PK
        text instance_id FK
        text campaign_id FK
        text group_jid
        text group_name
        text sender_jid
        text content
        text message_type
        text status
        text direction
    }
    auto_replies {
        text id PK
        text instance_id FK
        text name
        text trigger
        text response
        boolean is_active
        boolean use_ai
        text ai_instructions
        text document_id FK
    }
    chatbot_configs {
        text id PK
        text instance_id FK
        boolean is_active
        text system_prompt
        int max_tokens
        numeric temperature
        text company_info
        jsonb price_list
        text calendar
    }
    chatbot_paused {
        text id PK
        text instance_id FK
        text sender_jid
    }
    payment_destinations {
        text id PK
        text type
        text name
        boolean is_active
    }
    reported_payments {
        text id PK
        text user_id FK
        text destination_id
        numeric amount
        text status
    }
    plans {
        text id PK
        text name
        text slug UK
        numeric price_monthly
        numeric price_yearly
        int max_instances
    }
    user_addons {
        text id PK
        text user_id FK
        text addon_key
        int quantity
        numeric unit_amount
    }
    plan_addons {
        text key PK
        text label
        numeric unit_amount
        boolean is_active
    }
    testimonials {
        text id PK
        text author
        text quote
        int rating
    }
    ai_configs {
        text id PK
        text user_id FK
        text mode
        text provider
        text model
        text api_key_enc
        numeric monthly_quota
    }
    ai_saas_keys {
        text id PK
        text provider
        text api_key_enc
        boolean is_active
    }
    ai_usage_logs {
        text id PK
        text user_id FK
        text provider
        text model
        int input_tokens
        int output_tokens
        numeric estimated_cost
    }
    ai_audit_logs {
        text id PK
        text user_id FK
        text action
        text detail
    }
    conversations {
        text id PK
        text instance_id FK
        text jid
        text name
        text last_message
        datetime last_message_at
        int unread
        boolean archived
    }
    bot_documents {
        text id PK
        text instance_id FK
        text title
        text content
        text status
        text error
        text source
        text source_ref
        text source_url
    }
    bot_document_chunks {
        text id PK
        text document_id FK
        text instance_id FK
        int chunk_index
        text content
        jsonb embedding
    }
    google_connections {
        text id PK
        text user_id FK
        text instance_id FK UK
        text google_email
        text access_token_enc
        text refresh_token_enc
        text scopes
        datetime expires_at
    }
    instance_google_sources {
        text id PK
        text instance_id FK UK
        text sheet_id
        text sheet_name
        text sheet_range
        text[] doc_ids
        text calendar_id
        int calendar_days
    }
    user_block_audit {
        bigint id PK
        text actor_id
        text actor_name
        text target_id
        text target_name
        text action
        text reason
        datetime created_at
    }
```

> Las tablas `otp_codes`, `payment_destinations`, `plans`, `plan_addons`, `testimonials`, `ai_saas_keys` y `user_block_audit` no tienen claves foráneas; se relacionan lógicamente por columnas (p. ej. `reported_payments.destination_id` → `payment_destinations.id`, o `user_block_audit.actor_id`/`target_id` → `users.id`). Las tablas `products`, `documents` y `appointments` del antiguo módulo Negocio fueron eliminadas: esa información ahora se lee en vivo desde la cuenta de Google de cada instancia (`google_connections` + `instance_google_sources`).

### Permisos por módulo (`users.permissions`)

La columna `users.permissions` (`TEXT[]`) guarda los permisos que el **propietario** de la organización concede a cada miembro. El administrador global (`role = 'admin'`) y el propietario (`role = 'owner'`) siempre tienen acceso completo; el resto de usuarios solo acceden a los módulos incluidos en su lista.

| Permiso | Módulo / alcance |
|---------|------------------|
| `instances` | Instancias |
| `campaigns` | Campañas y envíos |
| `templates` | Plantillas |
| `groups` | Grupos |
| `auto_replies` | Auto-respuestas |
| `chatbot` | Chatbot |
| `ai_center` | Centro de IA |
| `reports` | Reportes, métricas y conversaciones |
| `billing` | Facturación y plan |
| `organization` | Organización y equipo |
| `messages` | Envío manual de mensajes |

Un miembro sin permisos solo ve el **Dashboard** y su **perfil**. El backend responde `403` en cualquier endpoint de un módulo no concedido (gate central en el router con `hasPermission`), y el sidebar del frontend oculta los módulos sin permiso. Los permisos se configuran desde *Organización y equipo → Equipo* (al invitar o editando un miembro).

### Número de teléfono de la instancia

La columna `instances.phone` se **rellena automáticamente** desde Evolution API al conectar la sesión: el backend consulta `GET /instance/fetchInstances` (header `apikey`), localiza la instancia por nombre/ID y guarda el campo `ownerJid` (normalizado, sin `@s.whatsapp.net`) en la base de datos. No se solicita el número en el formulario de creación/edición.

Gatillos de sincronización:

1. **Al conectar**: evento `CONNECTION_UPDATE` con `state === 'open'` del webhook de Evolution.
2. **Backfill**: `GET /api/instances/:id/status` cuando la instancia está conectada pero no tiene número guardado.

## 7. API REST

Todas las rutas están prefijadas con `/api`. Las rutas (excepto autenticación y el endpoint interno del chatbot) requieren sesión activa.

> **Permisos por módulo**: cada módulo exige el permiso correspondiente del usuario (ver *Permisos por módulo* en la sección 6). El administrador global y el propietario de la organización pasan siempre; un miembro sin el permiso recibe `403 { error: "No tienes permiso para acceder a este módulo" }`.

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/auth/csrf` | Obtiene un token CSRF |
| POST | `/api/auth/register` | Registra un usuario (requiere número verificado por OTP) |
| POST | `/api/auth/phone/send-code` | Envía un OTP de 6 dígitos por WhatsApp (`purpose`, devuelve teléfono enmascarado) |
| POST | `/api/auth/phone/verify` | Valida un OTP **sin consumirlo** (purposes `register`, `password_reset`, `phone_update`) |
| PUT | `/api/auth/phone` | Cambia/valida el número de WhatsApp (consume el OTP `phone_update`) |
| POST | `/api/auth/callback/credentials` | Inicia sesión con email y contraseña; si hay 2FA activa devuelve `requiresTwoFactor` y un `token` |
| POST | `/api/auth/two-factor/verify` | Completa el inicio de sesión con el código de 2FA |
| POST | `/api/auth/two-factor/resend` | Reenvía el código de 2FA |
| POST | `/api/auth/forgot/send` | Inicia el restablecimiento de contraseña (envía OTP `password_reset`) |
| POST | `/api/auth/forgot/reset` | Restablece la contraseña (consume el OTP `password_reset`) |
| POST | `/api/auth/settings` | Actualiza preferencias (notificaciones, 2FA) |
| GET | `/api/auth/session` | Obtiene la sesión actual |
| GET | `/api/auth/signout` | Cierra la sesión |

### Instalador (primer arranque)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/setup/status` | Indica si el sistema está instalado (`{ installed: true }`) |
| POST | `/api/setup/db-test` | Prueba la conexión a PostgreSQL con los datos indicados |
| POST | `/api/setup/test-service` | Prueba la conexión a un servicio externo (Evolution API, n8n) |
| POST | `/api/setup/install` | Completa la instalación: escribe `.env`, crea el esquema y el administrador, marca `data/setup.json` |

> Los endpoints del instalador son públicos y solo están disponibles mientras el sistema no está instalado.

### Onboarding obligatorio

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/onboarding` | Estado de onboarding del usuario (`{ completed, hasOrganization, isOwner, organization }`) |
| POST | `/api/onboarding/complete` | Crea la organización (el usuario pasa a `owner`) o se une a la existente y marca `onboarding_completed = TRUE` |

Tras registrarse, el usuario **no puede usar el panel** hasta completar el onboarding: los guards del frontend redirigen `/app` a `/onboarding` (y `/onboarding` al panel una vez completado). El administrador global (`role = 'admin'`) está exento y `GET /api/onboarding` le devuelve siempre `completed: true`.

- **Primer usuario**: `completeOnboarding` crea la organización con el nombre/descripción enviados, promueve al usuario a `owner`, asigna `organization_id` y refresca sus sesiones (role).
- **Miembros siguientes**: si la organización ya existe (localizada por `organization_id` o el `owner_id` de respaldo), el usuario se une como `user` conservando sus permisos.
- **Concurrencia**: la creación se serializa con `pg_advisory_xact_lock(hashtext('wa_ads_onboarding_org')::bigint)` dentro de la transacción para evitar dos organizaciones simultáneas.
- **Pasos del asistente**: propietario → *Organización, Equipo, WhatsApp, Campaña*; miembro → *Organización (unirse), WhatsApp, Campaña*. Los pasos *Equipo, WhatsApp y Campaña* son opcionales (se pueden saltar); el onboarding queda completado en el paso de organización.

### Instancias

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/instances` | Lista instancias |
| POST | `/api/instances` | Crea una instancia (y en Evolution API) |
| GET | `/api/instances/:id` | Obtiene una instancia |
| PUT | `/api/instances/:id` | Actualiza una instancia |
| DELETE | `/api/instances/:id` | Elimina una instancia |
| POST | `/api/instances/:id/connect` | Conecta y obtiene el código QR |
| DELETE | `/api/instances/:id/disconnect` | Desconecta la instancia |
| GET | `/api/instances/:id/qrcode` | Obtiene el código QR |
| GET | `/api/instances/:id/status` | Obtiene el estado de conexión (y sincroniza el teléfono) |
| POST | `/api/instances/sync` | Sincroniza desde Evolution API las instancias de la **organización** del usuario (disponible para cualquier usuario autenticado) |

> Al crear o actualizar una instancia, el backend también **garantiza el workflow dinámico en n8n** (`ensureN8nWorkflow`) si `N8N_URL` y `N8N_API_KEY` están configuradas.

> **Sincronización**: `POST /api/instances/sync` ya no está restringida al administrador. Cualquier usuario autenticado puede sincronizar y la reconciliación se acota a las instancias de su organización (las instancias remotas que no existan se crean a nombre del usuario que sincroniza). El sync global de segundo plano (arranque) sigue asignando las huérfanas al primer admin/owner.

> **Emisora de mensajes de seguridad** (`security_sender`): solo las instancias que el administrador/propietario marque con el toggle *"Enviar mensajes de seguridad"* pueden enviar códigos OTP (registro, 2FA, recuperación de contraseña, cambio de número). El backend exige `status='connected' AND security_sender = TRUE` para elegir emisora (`getOtpSenderInstance`); un miembro sin rol admin/owner no puede activar el flag (se conserva el valor existente). En la migración inicial, las instancias ya existentes de admin/owner quedan habilitadas automáticamente; en instalaciones nuevas nace con `FALSE`.

### Campañas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/campaigns` | Lista campañas (soporta `?limit=` ) |
| POST | `/api/campaigns` | Crea una campaña |
| GET | `/api/campaigns/:id` | Obtiene una campaña |
| PUT | `/api/campaigns/:id` | Actualiza una campaña |
| DELETE | `/api/campaigns/:id` | Elimina una campaña |
| POST | `/api/campaigns/:id/send` | Ejecuta el envío de la campaña |
| GET | `/api/campaigns/:id/logs` | Obtiene los logs de envío |

> **Programación**: el formulario usa un **calendario** para la fecha de envío y **relojes** (Material timepicker) para la hora de envío y para la ventana diaria (`start_time`/`end_time`) de campañas con recurrencia. `start_time` y `end_time` son del tipo `TIME` (hora del día, formato `HH:MM`); el backend los normaliza al guardar (`toTimeString`) y los devuelve como `HH:MM`. Al editar, la ventana de horas debe tener `end > start` (validado en el formulario). `PUT /api/campaigns/:id` actualiza también recurrencia, configuración, concurrencia, ventana de horas, intervalo y etiquetas excluidas.

> **Envío automático**: al crear/editar una campaña con fecha programada el backend la marca como `scheduled`; un **cron interno del contenedor** (`node-cron`, expresión `CAMPAIGN_CRON`, cada minuto por defecto) revisa las campañas vencidas (`scheduled_at <= NOW()`, activas, sin enviar, instancia conectada) y ejecuta el envío **sin depender de n8n ni de conexiones externas**. Las campañas recurrentes se reprograman automáticamente (`computeNextScheduled`) según `recurrence`/`interval_value`/`interval_unit`, respetando la ventana diaria `start_time`/`end_time` (`campaignInWindow`). El endpoint manual `POST /api/campaigns/:id/send` comparte la misma lógica (`executeCampaign`), que usa un `UPDATE` condicional para evitar envíos duplicados entre el cron y el envío manual.

> **Botones interactivos y tipo de integración** (`instances.integration`): las plantillas pueden incluir hasta **3 botones** (respuesta o URL). Con la **Cloud API oficial de Meta** (integración `*CLOUD*`/`*OFFICIAL*`/`*BUSINESS*`) se envían como mensaje interactivo real (`/message/sendButtons`); en cuentas **QR (Baileys)** Meta los bloquea, así que se degradan a una **caja de texto con formato código** que semeja un botón (con el enlace debajo, tappable). El tipo de integración se detecta automáticamente al sincronizar la instancia (`syncInstancePhone`) y se puede ver en la columna Seguridad/estado de la lista de instancias.

> **Registro por grupo**: cada envío individual (programado o inmediato) se registra en `message_logs` (dirección `outgoing`, estado `sent`/`failed`) para que las métricas del dashboard, reportes y la analítica de campaña lo contabilicen por grupo.

### Plantillas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/templates` | Lista plantillas |
| POST | `/api/templates` | Crea una plantilla |
| GET | `/api/templates/:id` | Obtiene una plantilla |
| PUT | `/api/templates/:id` | Actualiza una plantilla |
| DELETE | `/api/templates/:id` | Elimina una plantilla |

### Grupos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/groups` | Lista grupos |
| POST | `/api/groups` | Crea un grupo |
| GET | `/api/groups/:id` | Obtiene un grupo |
| PUT | `/api/groups/:id` | Actualiza un grupo |
| DELETE | `/api/groups/:id` | Elimina un grupo |
| POST | `/api/groups/sync` | Sincroniza grupos desde una instancia |

### Chatbot

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/chatbot/config/:instanceId` | Obtiene la configuración del chatbot |
| POST | `/api/chatbot/config` | Guarda la configuración del chatbot (prompt por instancia) |
| POST | `/api/chatbot/pause` | Pausa o reanuda una conversación |
| GET | `/api/chatbot/paused` | Lista conversaciones pausadas |
| DELETE | `/api/chatbot/paused` | Elimina una conversación pausada |
| GET | `/api/chatbot/documents?instanceId=` | Lista los documentos del bot de la instancia |
| POST | `/api/chatbot/documents` | Crea un documento (lo divide en fragmentos y calcula embeddings con el proveedor de IA) |
| POST | `/api/chatbot/documents/query` | Prueba la recuperación: devuelve los fragmentos relevantes a una consulta |
| DELETE | `/api/chatbot/documents/:id` | Elimina un documento (y sus fragmentos) |
| GET | `/api/chatbot/google/auth-url?instanceId=` | URL de autorización de Google de la instancia (inicia el OAuth) |
| GET | `/api/chatbot/google/callback?code=&state=` | Callback de OAuth (redirect de Google; asocia la cuenta a la instancia vía `state`) |
| GET | `/api/chatbot/google/status?instanceId=` | Estado de la conexión de Google de la instancia (`{ connected, email }`) |
| DELETE | `/api/chatbot/google?instanceId=` | Desconecta la cuenta de Google de la instancia |
| GET | `/api/chatbot/google/files?instanceId=&kind=sheets\|docs` | Lista las hojas de cálculo / documentos del Drive de la instancia |
| GET | `/api/chatbot/google/calendars?instanceId=` | Lista los calendarios de la instancia |
| GET | `/api/chatbot/google/sources?instanceId=` | Lee las fuentes configuradas de la instancia (`{ sheetId, sheetName, sheetRange, docIds, calendarId, calendarDays }`) |
| POST | `/api/chatbot/google/sources` | Guarda las fuentes de la instancia (body: `instanceId`, `sheetId`, `sheetName`, `sheetRange`, `docIds[]`, `calendarId`, `calendarDays`) |

### Respuestas automáticas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/auto-replies` | Lista reglas |
| POST | `/api/auto-replies` | Crea una regla |
| GET | `/api/auto-replies/:id` | Obtiene una regla |
| PUT | `/api/auto-replies/:id` | Actualiza una regla |
| DELETE | `/api/auto-replies/:id` | Elimina una regla |

### Facturación

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/billing` | Información del plan |
| GET | `/api/billing/invoices` | Lista de facturas |
| POST | `/api/billing/invoices/:id/pay` | Marca una factura como pagada |

### Métricas, análisis y conversaciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/metrics/dashboard` | Métricas del panel principal |
| GET | `/api/analytics/campaign/:id` | Analítica de una campaña |
| GET | `/api/conversations` | Lista de conversaciones |
| GET | `/api/conversations/history` | Historial de una conversación |

### Organizaciones y equipo

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/organizations` | Crea la organización (el creador pasa a `owner`) |
| GET | `/api/organizations/current` | Organización de la sesión |
| PUT | `/api/organizations/current` | Actualiza nombre/descripción |
| GET | `/api/organizations/current/members` | Lista de miembros (incluye `permissions`) |
| POST | `/api/organizations/current/members` | Añade un miembro (`name`, `email`, `password`, `permissions[]`) |
| PUT | `/api/organizations/current/members/:id` | Actualiza miembro (`name`, `permissions[]`) |
| DELETE | `/api/organizations/current/members/:id` | Elimina un miembro |

Solo el propietario (o el admin global) puede crear, editar o eliminar miembros. Los permisos se envían como array de claves válidas (ver sección 6) y se persisten en `users.permissions`.

### Usuarios del sistema (panel de usuarios)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/users` | Lista los usuarios visibles (miembros de la organización del usuario; el admin global ve a los propietarios de todas las organizaciones) |
| GET | `/api/users/audit` | Historial de bloqueos/desbloqueos (últimos 100 eventos, más reciente primero) |
| POST | `/api/users/:id/block` | Bloquea al usuario del sistema (`reason` opcional); revoca sus sesiones activas |
| POST | `/api/users/:id/unblock` | Desbloquea al usuario |

El listado está acotado por alcance: un **miembro de la organización** ve (y puede bloquear) únicamente a los usuarios de su organización (`users.organization_id`); el **admin global** ve a los propietarios de todas las organizaciones. El propietario gestiona a sus miembros; el admin global gestiona a los propietarios.

- **Bloqueo en cascada**: bloquear a un **propietario** (solo el admin global) bloquea también a todos los miembros de su organización con el mismo motivo; el desbloqueo del propietario restaura a los miembros bloqueados por esa cascada (mismo `blocked_reason`).
- **Bloqueo por falta de pago**: cuando el estado de facturación de un propietario pasa a `blocked` (créditos agotados/vencido), su organización entera se bloquea con el motivo `Falta de pago de la organización`; al confirmar el pago (`POST /api/billing/invoices/:id/pay`) se desbloquea toda la organización.
- No se puede bloquear la propia cuenta ni a administradores/propietarios de otras organizaciones (salvo el admin global sobre un propietario). Al bloquear a un usuario se borran sus sesiones de inmediato y no puede volver a iniciar sesión. La columna `blocked` (con `blocked_at` y `blocked_reason`) se añade automáticamente a `users` al arrancar.

Cada bloqueo/desbloqueo se registra en la tabla `user_block_audit` (actor, objetivo, acción, motivo y fecha). El panel muestra ese historial en una tarjeta propia, paginación local del listado (10/25/50 por página) y, si el usuario bloqueado tiene la app abierta, recibe por WebSocket el evento `account:blocked` (motivo incluido) que muestra un diálogo y cierra su sesión al instante; si no está conectado, lo verá al intentar iniciar sesión (se rechaza con el motivo).

### Centro de IA

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/ai` | Vista general (config, uso, proveedores disponibles) |
| GET | `/api/ai/config` | Configuración de IA del usuario actual |
| PUT | `/api/ai/config` | Guarda la configuración (modo, proveedor, modelo, clave, cuota) |
| POST | `/api/ai/validate` | Valida la conexión con el proveedor |
| POST | `/api/ai/test` | Prueba la IA con un mensaje |
| POST | `/api/ai/suggest` | Sugiere una respuesta |
| POST | `/api/ai/rotate-key` | Rota la API key del usuario |
| GET | `/api/ai/usage` | Consumo mensual y actividad reciente |
| GET | `/api/ai/catalogue` | Catálogo de proveedores (labels, modelos, costos, ayuda) |
| GET | `/api/ai/saas-keys` | Lista claves del sistema (admin) |
| POST | `/api/ai/saas-keys` | Guarda una clave del sistema (admin) |
| DELETE | `/api/ai/saas-keys/:id` | Elimina una clave del sistema (admin) |

### Webhooks y endpoints internos

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/webhooks` | Receptor de eventos de Evolution API (con apikey) |
| POST | `/api/ai/chatbot-reply` | Genera una respuesta de chatbot. Lo invoca n8n con header `apikey` de la instancia; fallback a sesión para herramientas |

### Formato de respuesta

Las respuestas JSON siguen el formato:

```json
{ "success": true, "data": { ... } }
```

En caso de error:

```json
{ "error": "Mensaje de error" }
```

## 8. Instalador de primer arranque (setup)

El backend detecta el estado de instalación con la marca `data/setup.json`:

| Estado | Comportamiento |
|--------|----------------|
| Sin marca y sin usuarios en BD | Modo setup: el servidor sirve solo el wizard (`/setup`) y no arranca los bucles de sincronización/billing |
| Sin marca y con usuarios (migración) | Se crea la marca con `legacy: true`; el sistema arranca normalmente y conserva los usuarios |
| Con marca (`installed: true`) | El sistema arranca completo |

### Flujo del wizard (`GET /setup`)

1. **Bienvenida**: explica el proceso.
2. **Base de datos**: ingresa la conexión PostgreSQL; `POST /api/setup/db-test` la prueba (la app crea el esquema automáticamente). 
3. **Servicios externos**: URLs y API keys de Evolution API y n8n; `POST /api/setup/test-service` prueba cada servicio.
4. **Administrador**: nombre, correo, contraseña (con medidor de fuerza) y WhatsApp opcional validado por OTP.
5. **Instalación**: `POST /api/setup/install` escribe el `.env` (sin sobrescribir variables no provistas, p. ej. API keys vacías), crea el pool, inicializa la BD, crea el administrador con `phone_verified` y escribe `data/setup.json`.

Al terminar, la app redirige a `/auth/login`. El guard del frontend (`AppComponent.checkSetup`) redirige a `/setup` cuando `installed: false`.

> El seed del administrador por defecto se eliminó de `initDb()`: **la cuenta de administrador solo la crea el instalador** (o una migración previa existente).

## 9. Flujo de autenticación y verificación por OTP

### Inicio de sesión

1. El frontend solicita un **token CSRF** (`GET /api/auth/csrf`).
2. Envía las credenciales (`POST /api/auth/callback/credentials`).
3. El backend valida contra la tabla `users`:
   - **Sin 2FA**: establece la cookie de sesión `httpOnly` y devuelve la sesión.
   - **Con 2FA** (`phone_verified` y `two_factor_enabled`): devuelve `{ requiresTwoFactor: true, token, maskedPhone }` y envía un OTP con propósito `login`.
4. El frontend muestra un campo OTP; al completar el sexto dígito envía `POST /api/auth/two-factor/verify` con el `token` y el código. El backend **consume** el código (`used = true`) y establece la sesión.
5. `POST /api/auth/two-factor/resend` reenvía el código (respetando `OTP_RESEND_MS`).
6. El frontend consulta la sesión (`GET /api/auth/session`) para restaurar el estado.
7. Al cerrar sesión se elimina la cookie (`GET /api/auth/signout`).

### Registro con OTP

1. El usuario llena el formulario (nombre, correo, WhatsApp con selector de país, contraseña).
2. `POST /api/auth/phone/send-code` (propósito `register`) envía el código de 6 dígitos por WhatsApp y devuelve el teléfono enmascarado.
3. El frontend muestra un **input OTP** (`app-otp-input`, estilo `123-456`); al completar el sexto dígito llama `POST /api/auth/phone/verify` (propósito `register`), que valida **sin consumir** el código.
4. Si es válido, el botón "Crear cuenta" se habilita y `POST /api/auth/register` **consume** el código y crea el usuario (`phone_verified = true`).

### Restablecimiento de contraseña

1. `POST /api/auth/forgot/send` valida el correo y envía un OTP con propósito `password_reset`.
2. El usuario introduce el código (con `app-otp-input`) y la nueva contraseña.
3. `POST /api/auth/forgot/reset` **consume** el código y actualiza la contraseña.

### Cambio de número de WhatsApp

1. En Configuración, el usuario edita el número y pulsa "Enviar código" (`send-code`, propósito `phone_update`).
2. Al completar el sexto dígito, `PUT /api/auth/phone` **consume** el código (`phone_update`) y actualiza `users.phone` con `phone_verified = true`.

> **Validación no destructiva**: `POST /api/auth/phone/verify` usa `checkOtpByPhone` (no consume); los flujos finales (registro, 2FA, cambio de teléfono, reset) usan `verifyOtpRow` con `consume = true`.

### Instancia de verificación (solo del administrador)

Los códigos OTP se envían **exclusivamente desde instancias del administrador**: se elige entre las instancias conectadas cuyo `user_id` pertenezca a un usuario `admin` o `owner` (las instancias de los miembros nunca envían códigos). Además, cada instancia tiene un **rol de verificación** (`instances.verification_role`) que determina qué propósitos puede cubrir:

| Rol | Propósitos |
|-----|-----------|
| `otp` | `register`, `login`, `notification`, `phone_update` |
| `password` | `password_reset` |
| `other` | Otros envíos de verificación |
| `all` | Todos |

`getOtpSenderInstance(purpose)` devuelve la primera instancia conectada del administrador cuyo rol cubra el propósito; si ninguna lo cubre, el envío no se completa y el código se loguea (`delivered: false`, `noInstance: true`).

Las sesiones se almacenan en memoria (objeto `sessions` en `server.js`). En un despliegue con múltiples instancias se recomienda un almacén compartido.

## 10. Chatbot conversacional

### Configuración

- Cada instancia tiene su **propio prompt de sistema** (`chatbot_configs.system_prompt`), configurable desde la UI (módulo chatbot) con `POST /api/chatbot/config`.
- El chatbot debe estar activo (`chatbot_configs.is_active`) para procesar mensajes.
- Las API keys de IA se almacenan **cifradas** (AES-256-GCM) con la clave maestra derivada de `AI_ENC_KEY` (o `SESSION_SECRET`).

### Conocimiento del bot

- **Campos del prompt**: además del comportamiento (`system_prompt`), cada instancia puede definir `company_info` (información de la empresa), `price_list` (lista de precios) y `calendar` (disponibilidad). `buildChatbotSystemPrompt` los combina en el prompt de sistema que recibe la IA.
- **Documentos (RAG)**: `POST /api/chatbot/documents` guarda textos largos (catálogos, políticas, menús...) en `bot_documents`, los divide en fragmentos con solape (`chunkText`, ~900 caracteres) y calcula sus **embeddings** con el proveedor de IA activo del tenant cuando lo soporta (`IAProvider.embed`; Gemini, OpenAI y Mistral lo exponen).
- **Recuperación**: al responder, `retrieveBotContext` calcula el embedding de la consulta del cliente y devuelve los fragmentos más parecidos por **similitud coseno** (umbral 0.15), que se inyectan como "INFORMACIÓN EXTRAÍDA DE LOS DOCUMENTOS DE LA EMPRESA". Si el proveedor no tiene embeddings o fallan, cae a **búsqueda léxica** por coincidencia de palabras (funciona siempre).
- **Estado del documento**: `stored` (con embeddings) o `lexical` (búsqueda por palabras); se puede probar la recuperación con `POST /api/chatbot/documents/query`.
- **Auto-respuestas con documento**: una regla de auto-respuesta en modo IA puede vincular un documento de su instancia (`auto_replies.document_id`); al dispararse recupera solo los fragmentos de ese documento y los usa como referencia, permitiendo alimentar una parte específica del conocimiento.
- El bot funciona **sin auto-respuestas configuradas**: el chatbot IA (con o sin n8n) usa directamente el conocimiento de la instancia.

### Datos del negocio desde Google (hojas de cálculo, documentos y agenda)

El bot se alimenta no solo con texto pegado a mano (`source = manual`) sino también desde la **cuenta de Google de cada instancia**: hojas de cálculo (`sheet`), documentos de Google (`docs`) y agenda (`calendar`). A diferencia del modelo anterior (que copiaba el contenido a `bot_documents` como "instantánea"), ahora las fuentes se **leen en vivo** en cada respuesta (`buildGoogleBusinessContext`): el bot consulta los datos actuales de la hoja, los documentos y el calendario seleccionados y los inyecta como "DATOS ACTUALES DE LA CUENTA DE GOOGLE DE LA INSTANCIA". Si un archivo cambia, el bot responde con lo nuevo automáticamente, sin reimportar nada.

- **`google_connections` por instancia**: una fila por instancia con los tokens de OAuth **cifrados** (`access_token_enc`, `refresh_token_enc`, `scopes`, `expires_at`); `instance_id` es único. El access token se renueva automáticamente con el refresh token antes de cada llamada.
- **`instance_google_sources`**: qué fuentes alimentan a cada instancia — `sheet_id` + `sheet_name` + `sheet_range` (catálogo/precios), `doc_ids[]` (documentos) y `calendar_id` + `calendar_days` (agenda). Se guardan con `POST /api/chatbot/google/sources` y se leen con `GET /api/chatbot/google/sources?instanceId=`.
- **Conexión**: `GET /api/chatbot/google/auth-url?instanceId=` devuelve la URL de autorización; el navegador pasa por Google y `GET /api/chatbot/google/callback` intercambia el código, asocia la cuenta a la instancia mediante el parámetro `state` y redirige de vuelta a la SPA (`/app/chatbot`). El estado se consulta con `GET /api/chatbot/google/status?instanceId=` y se desconecta con `DELETE /api/chatbot/google?instanceId=`.
- **Listados**: `GET /api/chatbot/google/files?instanceId=&kind=sheets|docs` lista el Drive de la cuenta conectada (Drive API) y `GET /api/chatbot/google/calendars?instanceId=` sus calendarios.
- **Lectura en vivo** (`buildGoogleBusinessContext`): solo lee las fuentes configuradas de la instancia:
  - **Hoja de cálculo** (`Sheets API`): lee las pestañas (máx. 20, 5000 filas/pestaña), usa la primera fila como nombres de columna y genera `Columna: valor | ...` por fila; respeta `sheet_name` y `sheet_range` si se configuran.
  - **Documentos** (`Docs API`): extrae párrafos y tablas del JSON estructural (`body.content`) a texto plano (máx. 2000 caracteres cada uno).
  - **Agenda** (`Calendar API`): eventos de los próximos N días (`calendar_days`, por defecto 30, máx. 365) formateados como `Evento | Fecha | Lugar | Descripción`.
- **Contexto en vivo**: se combina con el prompt del chatbot (el de la instancia) y también con las **auto-respuestas en modo IA** (`processAutoReply` usa `buildChatbotSystemPrompt` de su instancia + las reglas de la respuesta + los datos en vivo de Google como fuente de verdad).
- **Scopes solicitados** (solo lectura): `userinfo.email`, `drive.readonly`, `spreadsheets.readonly`, `documents.readonly`, `calendar.readonly`.

#### Guía: crear las credenciales de Google OAuth

Para activar la conexión con Google necesitas un proyecto en **Google Cloud Console** con credenciales OAuth. Los pasos (unos 10-15 minutos):

1. **Crear el proyecto**: entra en https://console.cloud.google.com/ → crea un proyecto (p. ej. "WhatsApp Ads").
2. **Habilitar las APIs** (APIs y servicios → Biblioteca): `Google Drive API`, `Google Sheets API`, `Google Docs API` y `Google Calendar API`.
3. **Pantalla de consentimiento** (APIs y servicios → Pantalla de consentimiento de OAuth):
   - Modo **Externo**. Completa el nombre de la app y el correo de soporte.
   - En **Scopes**: agrega los de solo lectura de Drive, Sheets, Docs y Calendar (o usa el nivel por defecto; la app los pide al conectar).
   - En **Usuarios de prueba**: añade tu cuenta de Google (mientras la app esté en modo "Testing" solo funcionará con estos usuarios; para producción pulsa "Publicar").
4. **Crear el Client ID** (Credenciales → Crear credenciales → ID de cliente de OAuth):
   - Tipo de aplicación: **Aplicación web**.
   - Nombre: "WhatsApp Ads".
   - **URIs de redireccionamiento autorizadas**: agrega `http://localhost:3000/api/chatbot/google/callback` (y la URL pública de tu despliegue, por ejemplo `https://tu-dominio.com/api/chatbot/google/callback`).
   - El valor **debe coincidir** con `GOOGLE_REDIRECT_URI` (por defecto `{APP_URL}/api/chatbot/google/callback`).
5. **Guardar las credenciales**: copia el **Client ID** y el **Client Secret** y configúralos en el entorno:
   ```dotenv
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
   # GOOGLE_REDIRECT_URI=http://localhost:3000/api/chatbot/google/callback  (opcional)
   ```
   En Docker, agrégalas al `.env` del proyecto (el compose las inyecta) y reinicia el contenedor: `docker compose up -d app`.
6. **Usar la app**: en el módulo **Chatbot** aparece la tarjeta *"Datos del negocio desde Google"*. Conecta la cuenta de Google de la instancia y elige qué hoja de cálculo, documentos y calendario alimentan al bot (todo opcional); pulsa *"Guardar fuentes del bot"*. Desde ese momento el bot lee esos datos **en vivo** en cada respuesta.

### Pausa por conversación

- Enviar un mensaje manual a un chat privado inserta al remitente en `chatbot_paused` (ON CONFLICT DO NOTHING): el chatbot deja de responder a ese contacto hasta que se reanude.
- El webhook ignora los mensajes con `key.fromMe` (`skipped: 'fromMe'`).

### Ruta de entrega

- Si n8n está habilitado (`N8N_URL` + `N8N_API_KEY`), el DM se deriva a `handleN8nChatbot` (n8n como capa de entrega).
- El webhook de Evolution llega a `POST /api/webhooks`; para los DMs privados se valida la instancia por `apikey` del header y se invoca `handleWebhook`.

## 11. Orquestación dinámica con n8n

**n8n es un entorno único global del sistema.** La app crea automáticamente un workflow por instancia a través de la **REST API pública de n8n** (`/api/v1/workflows`) usando la cabecera `X-N8N-API-KEY`.

### Workflow por instancia (`dm-chatbot-<instanceId>`)

Cada workflow se llama `WhatsApp Chatbot - <nombre de instancia>` y contiene:

| Nodo | Tipo | Función |
|------|------|---------|
| DM Webhook | `n8n-nodes-base.webhook` | Recibe el DM reenviado por la app (path `dm-chatbot-<id>`) |
| Parse Payload | `n8n-nodes-base.code` | Extrae `instanceId`, `sender`, `senderName`, `content`, `chatJid`, `apiKey` |
| Generate Reply (App IA) | `n8n-nodes-base.httpRequest` | `POST {N8N_APP_URL}/api/ai/chatbot-reply` con header `apikey` |
| Extract Reply | `n8n-nodes-base.code` | Toma `res.reply`; si viene vacío termina sin enviar |
| Send Reply | `n8n-nodes-base.httpRequest` | `POST {N8N_EVOLUTION_URL}/message/sendText/<instance>` |

**Ciclo completo:**

1. El backend recibe el DM vía webhook de Evolution y llama a `handleN8nChatbot`.
2. `ensureN8nWorkflow(instance)` lista los workflows de n8n, localiza (o crea) el del webhook y lo **activa** (`POST /api/v1/workflows/{id}/activate`). `active:true` es de solo lectura en el payload de creación.
3. La app reenvía el DM a `POST {N8N_URL}/webhook/dm-chatbot-<id>`.
4. n8n llama al backend (`/api/ai/chatbot-reply`, autenticado con la `apiKey` de la instancia en el header `apikey`) y la app genera la respuesta con el **AI Center** del tenant (cuota, auditoría, proveedor).
5. n8n envía la respuesta por Evolution (`message/sendText`) al chat original.

### Configuración de la API Key de n8n

La app usa `N8N_API_KEY` en la cabecera `X-N8N-API-KEY`. En **n8n 2.x**:

- La variable de entorno `N8N_API_KEY` **se ignora**: las API keys públicas se gestionan dentro de la base de datos de n8n.
- Las claves son **JWTs** firmados con el secreto de `deployment_key` (tipo `signing.jwt`), almacenados en la tabla `user_api_keys`.
- **Crear la clave** desde la interfaz: *Settings → Public API → Create API Key*. Los scopes necesarios: `workflow:read`, `workflow:create`, `workflow:update`, `workflow:activate`, `workflow:deactivate`.
- Verificación con una clave válida: `GET {N8N_URL}/api/v1/workflows` con `X-N8N-API-KEY: <jwt>` debe responder `200`.

### URL internas usadas por los workflows

| Variable | Valor típico | Uso |
|----------|--------------|-----|
| `N8N_APP_URL` | `http://host.docker.internal:3000` | n8n → app (`/api/ai/chatbot-reply`) |
| `N8N_EVOLUTION_URL` | `http://evolution_api:8080` | n8n → Evolution (`message/sendText`) |

El nombre de la instancia en la URL de envío se codifica con `encodeURIComponent` (p. ej. `Test Phone` → `Test%20Phone`).

### Flujos exportados (`n8n-workflows/`)

Son de referencia (importables desde la UI de n8n). El **envío automático de campañas ya no depende de n8n**: lo gestiona el cron interno de la app (`processDueCampaigns`, ver *Envío automático* en la sección 7), por lo que `campaign-sender.json` queda obsoleto:

- **campaign-sender.json** (legacy): trigger periódico que consultaba campañas programadas al backend y disparaba el envío. La app ahora se auto-programa con `node-cron`.
- **webhook-receiver.json**: trigger HTTP que reenvía eventos de Evolution al backend.

## 12. Centro de IA

Módulo que gestiona los proveedores de IA y la generación de respuestas del chatbot.

### Proveedores

Registrados en `providers/provider-manager.js` (clase `ProviderManager`, único punto de entrada). Catálogo actual:

| ID | Label | ¿API Key? | ¿Base URL? |
|----|-------|-----------|------------|
| gemini | Google Gemini | sí | no |
| openai | OpenAI | sí | no |
| claude | Anthropic Claude | sí | no |
| deepseek | DeepSeek | sí | no |
| mistral | Mistral | sí | no |
| openrouter | OpenRouter | sí | no |
| azure | Azure OpenAI | sí | sí (endpoint/deployment) |

Cada proveedor implementa la interfaz `IAProvider` (`providers/ia-provider.js`): `validateConnection()`, `generate()` y, opcionalmente, `embed(settings, texts)` + el getter `embedModel` para los **embeddings** (documentos RAG del chatbot). Los que exponen embeddings: **gemini** (`gemini-embedding-001`), **openai** (`text-embedding-3-small`) y **mistral** (`mistral-embed`); el resto (claude, deepseek, openrouter, azure) devuelven `null` y el chatbot usa búsqueda léxica. El formato de cada API key se valida en `security/api-keys.js`.

### Modos

- **SaaS**: el sistema usa la clave administrada por el admin (`ai_saas_keys`, activa para el proveedor). El usuario no introduce API key.
- **BYOK**: el usuario introduce su propia API key, que se cifra (AES-256-GCM) y se guarda en `ai_configs.api_key_enc`. Nunca se devuelve en claro; solo se muestra enmascarada (`****ABCD`).

### Cuota y auditoría

- Cada usuario tiene una cuota mensual (`ai_configs.monthly_quota`, USD). `checkAiQuota` bloquea las peticiones por encima del límite.
- Cada llamada se registra en `ai_usage_logs` (tokens, costo estimado, estado) y las acciones sensibles (guardar/rotar claves, validar) en `ai_audit_logs`.

### Resolución de settings en tiempo de ejecución

`resolveAiSettings(session, config)` devuelve el proveedor, modelo, apiKey y baseUrl efectivos según el modo. En modo SaaS la clave se toma de `ai_saas_keys`; en BYOK se descifra la del tenant. El chatbot la usa vía `generateChatbotReply` (server.js).

## 13. Estructura del frontend

```
src/app/
├── core/
│   ├── guards/          # Protección de rutas autenticadas
│   ├── interceptors/    # Interceptor HTTP (sesión)
│   ├── models/          # Modelos de datos (instancia, campaña, ai-center, etc.)
│   └── services/        # Servicios de consumo de la API
├── layout/              # Layout principal (header, sidebar, footer)
├── modules/
│   ├── ai-center/       # Centro de IA (configuración, uso, claves SaaS)
│   ├── auth/            # Login, registro y restablecimiento de contraseña (con OTP)
│   ├── auto-replies/    # Respuestas automáticas
│   ├── billing/         # Facturación
│   ├── campaigns/       # Campañas
│   ├── chatbot/         # Chatbot
│   ├── conversations/   # Conversaciones
│   ├── dashboard/       # Panel principal
│   ├── groups/          # Grupos
│   ├── instances/       # Instancias de WhatsApp
│   ├── landing/         # Página de inicio pública
│   ├── legal/           # Privacidad, términos, cookies, seguridad, RGPD
│   ├── onboarding/      # Onboarding
│   ├── profile/         # Perfil
│   ├── reports/         # Reportes
│   ├── resources/       # Recursos, ayuda, comunidad, etc.
│   ├── settings/        # Ajustes (incluye cambio de número con OTP y 2FA)
│   ├── setup/           # Instalador de primer arranque (/setup)
│   └── templates/       # Plantillas de mensajes
└── shared/
    ├── components/      # country-code-selector, otp-input, etc.
    ├── pipes/           # Pipes compartidos
    └── utils/           # Utilidades compartidas
```

## 14. Backend: organización del código (`server.js`)

| Zona | Líneas aprox. | Contenido |
|------|---------------|-----------|
| Esquema de BD | 177+ | `initDb` y migraciones (tablas de la app, del Centro de IA y `otp_codes`; `ALTER TABLE ... onboarding_completed`/`blocked`) |
| Permisos y gate | 974+ | Catálogo `PERMISSION_LABELS`, `sanitizePermissions`, `hasPermission`, `permForModule` y gate en el router |
| Autenticación y OTP | 966+ | `genOtpCode`, `sendOtpByWhatsApp`, `createOtp`, `verifyOtpRow`, `checkOtpByPhone`, `verifyOtpByPhone/Token` |
| Setup / instalador | 1305+ | `handleSetup`, endpoints `/api/setup/*`, `updateEnvFile`, `buildDbUrl`, `testDbConnection` |
| Router API | 1553+ | Despacho por recurso (`case 'onboarding'`, `'users'`, ...) y gate de permisos por módulo |
| Organizaciones | 2122+ | `getCurrentOrganization`, `createOrganization`, `getOrganizationMembers`, `addOrganizationMember`, `updateOrganizationMember`, `removeOrganizationMember` |
| Onboarding obligatorio | 2157+ | `getOnboardingStatus`, `completeOnboarding` (crear/unirse con advisory lock) |
| Usuarios del sistema | 2401+ | `getAdminUsers` (alcance por org/admin), `blockUser`/`unblockUser` (cascada), `getUsersAudit` |
| Instancias | 2617+ | CRUD, conexión/QR, estado, sincronización con Evolution |
| Billing | 4172+ | `computeBillingState`, `verifyReportedPayment`, `runBillingChecks` (bloqueo en cascada por falta de pago) |
| AI Center | 5489+ | `getAiOverview`, config, validación, cuota, uso, claves SaaS |
| Webhook / chatbot | 5956+ | `syncInstancePhone`, `handleWebhook`, `handleN8nChatbot` |
| n8n dinámico | 6109+ | `buildN8nChatbotWorkflow`, `ensureN8nWorkflow` (workflow por instancia `dm-chatbot-<id>`) |
| IA del chatbot | 6300+ | `generateChatbotReply` (usa el AI Center del tenant) |
| Arranque | 6554+ | `start()`: modo setup vs. instalado, bucles de sync y billing, y cron de campañas (`processDueCampaigns`) |

## 15. Resolución de problemas

### "password authentication failed for user postgres"

La base de datos no se pudo conectar. Verificar:

- Que el contenedor `whatsapp_ads_postgres` esté activo: `docker ps`.
- Que `DATABASE_URL` en `.env` coincida con el puerto del contenedor (5432 por defecto).
- Que no haya otro PostgreSQL ocupando el puerto 5432 en el host.

### La imagen de Evolution API no se descarga

Usar la imagen oficial: `evoapicloud/evolution-api:latest`. La imagen `atendai/evolution-api` ya no está disponible en Docker Hub.

### "Database provider invalid" en Evolution API

Falta `DATABASE_PROVIDER=postgresql` y el URI de conexión debe usar el protocolo `postgresql://` con el parámetro `?schema=public`.

### El código QR no aparece

Verificar que la instancia exista en Evolution API y que el estado sea `disconnected` o `connecting`. Revisar los logs: `docker compose logs -f evolution_api`.

### Cambiar el puerto de la aplicación

Editar `PORT` en `.env` y reiniciar el servidor: `npm run serve`.

### No se reciben webhooks de Evolution API

- Verificar que `WEBHOOK_GLOBAL_URL` apunte a una URL accesible por el contenedor (`http://host.docker.internal:3000/api/webhooks` para acceso al host).
- Confirmar que el backend esté corriendo en el puerto 3000.
- Comprobar en los logs de Evolution API si los eventos se están emitiendo.

### n8n rechaza la API key (401/403)

- **n8n 2.x ignora `N8N_API_KEY`**: la clave debe crearse en *Settings → Public API*.
- La clave es un **JWT** firmado con el secreto de `deployment_key` (tipo `signing.jwt`). Un `deployment_key` cambiado invalida las claves existentes.
- Verificar los scopes de la clave (`workflow:create/update/activate/...`).
- Comprobar: `curl -H "X-N8N-API-KEY: <jwt>" http://localhost:5678/api/v1/workflows`.

### Las ejecuciones del workflow n8n fallan con el número de destino

- Evolution responde `exists:false` para números que **no existen en WhatsApp** (el `error` típico en `message/sendText`).
- El número real de la instancia se obtiene automáticamente (campo `ownerJid`) y queda en `instances.phone` al conectar; úsalo como destino.
- Revisar que `N8N_EVOLUTION_URL` apunte al contenedor correcto dentro de la red de Docker.

### La ejecución n8n no genera respuesta

- Confirmar que la instancia tiene chatbot activo y el contacto no está en `chatbot_paused`.
- Revisar que el AI Center del tenant esté configurado (SaaS con clave de sistema o BYOK con clave propia) y que `GET /api/ai` devuelva un `effective` válido.
- Probar el endpoint interno directamente: `POST /api/ai/chatbot-reply` con el body del DM y el header `apikey` de la instancia.

### No llega el código OTP por WhatsApp

- El envío usa la **primera instancia conectada** (`getOtpSenderInstance`) de Evolution API; si no hay instancia conectada, el código se loguea en consola (`[OTP] Sin instancia conectada. Código para +…: …`) pero no se envía.
- Si el envío falla (`Bad Request` en `server.err.log`), verificar que `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` sean correctos y que la instancia usada tenga sesión abierta.
- El reenvío está limitado a **1 por minuto** por teléfono y propósito (`OTP_RESEND_MS`); `POST /api/auth/phone/send-code` devuelve `429` si se intenta antes.
- Los códigos tienen **validez de 10 minutos** y **5 intentos** antes de invalidarse.
- Si el sistema está **en modo setup** (sin instalar), los bucles de sincronización no corren; la entrega de OTP del instalador usa la misma vía de WhatsApp.

### El instalador no arranca o redirige a `/setup` indebidamente

- El modo setup se activa cuando **no existe `data/setup.json`** y no hay usuarios. Si hay usuarios pero falta la marca, el sistema la crea con `legacy: true` al arrancar.
- Borrar `data/setup.json` en un entorno ya instalado fuerza de nuevo el wizard; no lo hagas si la BD ya tiene datos sin migrar.
- Si `POST /api/setup/install` falla, revisar la prueba de conexión (`/api/setup/db-test`) y que la credencial de PostgreSQL permita crear tablas.
