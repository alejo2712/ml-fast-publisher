# FastPublisher — Publicá en Mercado Libre más rápido

MVP de publicación asistida para Mercado Libre, enfocado en electrodomésticos.

## Setup rápido

```bash
cp .env.example .env.local   # completar variables (ver abajo)
npm install
docker-compose up -d         # iniciar PostgreSQL local
DATABASE_URL=... npx prisma db push   # sincronizar schema
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000)

> **Seguridad:** `MERCADOLIBRE_DRY_RUN=true` por defecto — nunca publica nada real hasta que lo cambies explícitamente.

---

## Variables de entorno

Copiá `.env.example` a `.env.local` y completá:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `postgresql://mlpublisher:mlpublisher@localhost:5432/mlpublisher` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `MERCADOLIBRE_CLIENT_ID` | ID de tu app ML |
| `MERCADOLIBRE_CLIENT_SECRET` | Secret de tu app ML |
| `MERCADOLIBRE_REDIRECT_URI` | `http://localhost:3000/api/ml/callback` |
| `MERCADOLIBRE_SITE_ID` | `MLA` (Argentina), `MLB` (Brasil), `MLM` (México) |
| `MERCADOLIBRE_DRY_RUN` | `true` (default seguro) · `false` = publica de verdad |
| `IMAGE_PUBLIC_BASE_URL` | Opcional — `https://tu-dominio.com` para imágenes locales en publicación real |

> **Nunca commitees `.env.local` ni ningún archivo `.env.*` con secretos.**

---

## Modo dry-run (default)

`MERCADOLIBRE_DRY_RUN=true` es el valor por defecto. En este modo:

- El botón "Publicar" simula el flujo completo sin llamar a la API de ML
- El payload se valida completamente y se muestra el resultado simulado
- Las imágenes locales (`/uploads/...`) están permitidas
- **No se crea ningún ítem real en Mercado Libre**

Para publicar de verdad: configurá credenciales ML + `MERCADOLIBRE_DRY_RUN=false`.

---

## Conectar Mercado Libre (OAuth)

### 1. Crear la app en ML

1. Ir a https://developers.mercadolibre.com.ar/apps/new
2. Completar nombre y descripción de la app
3. En **Redirect URIs** agregar: `http://localhost:3000/api/ml/callback`
4. Copiar el **Client ID** y **Client Secret**

### 2. Configurar `.env.local`

```env
MERCADOLIBRE_CLIENT_ID=tu_client_id
MERCADOLIBRE_CLIENT_SECRET=tu_client_secret
MERCADOLIBRE_REDIRECT_URI=http://localhost:3000/api/ml/callback
MERCADOLIBRE_SITE_ID=MLA
```

### 3. Iniciar el flujo OAuth

1. Reiniciá el servidor: `npm run dev`
2. Ir a `/settings/mercadolibre`
3. Hacer click en **"Conectar cuenta ML"**
4. ML pide autorización → aprobá
5. Redirige a `/settings/mercadolibre?connected=true`
6. Los tokens se guardan en la DB (`mercadolibre_accounts`)

### Desconectar

En `/settings/mercadolibre` → botón **"Desconectar"** → modal de confirmación → elimina tokens del DB y caché.

### Reconectar

Si el token venció o se desconectó: hacer el flujo OAuth nuevamente desde el paso 3. El refresh token permite renovación automática al publicar.

---

## Preflight — verificación antes de publicar

Antes de cualquier publicación real, el sistema corre un **preflight** automático:

```
POST /api/ml/preflight  { payload: MLPayload }
```

Verifica:
- Credenciales configuradas
- Cuenta ML conectada (OAuth)
- Validez y frescura del token de acceso
- Refresh token disponible
- Modo de publicación (dry-run vs real)
- Estructura y campos requeridos del payload
- Imágenes publicables (HTTPS)
- `IMAGE_PUBLIC_BASE_URL` cuando hay imágenes locales

Si hay **bloqueos** → confirmación deshabilitada, se muestran los errores.
Si hay solo **advertencias** → se puede publicar tras confirmar con checkbox.

Para correr el preflight manualmente: `/settings/mercadolibre` → **"Verificar preparación para publicación"**.

---

## Imágenes en publicación real

Mercado Libre requiere URLs **HTTPS públicas**. Las imágenes locales (`/uploads/...`) solo funcionan en dry-run.

**Opción A:** Usar URLs externas directamente (ej. Cloudinary, S3 público)

**Opción B:** Configurar `IMAGE_PUBLIC_BASE_URL=https://tu-dominio.com`
— El sistema convierte `/uploads/foto.jpg` → `https://tu-dominio.com/uploads/foto.jpg` automáticamente al publicar.

> `IMAGE_PUBLIC_BASE_URL` debe empezar con `https://`. URLs `http://` son rechazadas.

---

## Flujo de un producto

1. Escribís: `Heladera Samsung no frost 320 litros blanca`
2. El sistema infiere: marca, categoría, condición, capacidad, color, tecnología
3. Completás solo los campos faltantes (precio, modelo, foto)
4. Revisás el JSON → Preflight → Publicás

---

## Flujo bulk (CSV)

1. Descargás la plantilla CSV desde el tab "Carga masiva"
2. Completás filas (una por producto)
3. Subís el CSV o pegás los datos
4. El sistema procesa: inferencia + validación por fila
5. Ves estado por fila: ✓ listo / ⚠ advertencias / ✗ error
6. Editás filas con errores inline
7. Publicás los válidos fila por fila

### Columna mínima requerida
`descripcion_corta` + `precio` — todo lo demás se infiere o es opcional.

---

## Checklist de rollout a producción

Antes de habilitar publicación real en producción:

- [ ] Credenciales ML configuradas en variables de entorno del servidor
- [ ] OAuth flow probado: conectar → desconectar → reconectar
- [ ] Tokens persistidos en DB (verificar con `/api/ml/status`)
- [ ] Refresh token funcional (test con token vencido)
- [ ] `IMAGE_PUBLIC_BASE_URL` configurado con URL HTTPS del servidor
- [ ] Preflight corre sin bloqueos (usar "Verificar preparación" en `/settings/mercadolibre`)
- [ ] Test dry-run completado sin errores
- [ ] `MERCADOLIBRE_DRY_RUN=false` seteado explícitamente
- [ ] Categorías ML verificadas contra API real (IDs en `CLAUDE.md` son estimados)
- [ ] Rate limiting considerado (~50 req/s ML API)

---

## Validación

El sistema bloquea export/publish hasta que:
- título: 10–60 caracteres, sin garbage
- condición: `new`, `used` o `refurbished`
- precio: número positivo > 100
- stock: entero positivo
- imágenes: URLs válidas con https:// o `/uploads/...` (solo dry-run)

---

## Arquitectura

```
src/
  config/categories/     # Schemas de categorías (config-driven)
  lib/
    inference/           # Motor determinístico (adaptador intercambiable)
    payload-builder/     # Construye payload ML
    validation/          # validateDraft() — reglas estrictas + errores por campo
    csv/                 # Parser + template generator
    images/              # prepareImages() — clasificación y conversión de URLs
    mercadolibre/
      auth.ts            # OAuth helpers (SERVER-SIDE ONLY)
      client.ts          # Typed fetch wrapper (SERVER-SIDE ONLY)
      publish.ts         # publishSingleItem / publishBulkItems + dry-run gate
      preflight.ts       # runPreflight() — readiness checks sin publicar
  app/api/ml/
    auth/                # GET → redirect a ML OAuth
    callback/            # GET → intercambia code → tokens → DB + caché
    status/              # GET → estado de conexión (sin exponer tokens)
    preflight/           # POST → verificación de preparación
    publish/             # POST → publica (o dry-run) + historial
    disconnect/          # DELETE → elimina tokens DB + caché
    test-dry-run/        # POST → test pipeline siempre seguro
  components/
    AssistedPublisher/   # Flujo single-product
    PublishButton/       # Modal + preflight + dry-run indicator
    MLConnectionSettings/ # Dashboard de configuración ML
    BulkUpload/          # Carga masiva
```

---

## Agregar nueva categoría

1. `src/config/categories/appliances.ts` — agregar `CategoryConfig`
2. `src/lib/inference/dictionaries.ts` — agregar keywords y type
3. Listo — payload builder, validación y UI lo toman automáticamente

## Reemplazar inferencia por IA

```typescript
// src/lib/inference/index.ts
export class ClaudeInferenceAdapter implements InferenceAdapter {
  async infer(input: string): Promise<InferenceResult> {
    // llamar Claude API, parsear a InferenceResult
  }
}
```

---

## Categorías soportadas

**Grandes:** Heladera, Lavarropas, Secadora, Lavavajillas, Horno, Cocina, Freezer

**Pequeños:** Microondas, Freidora de Aire, Licuadora, Cafetera, Pava Eléctrica, Aspiradora, Plancha, Tostadora

**Roadmap:** Celulares, Colchones, Sommiers, Sábanas, Almohadas, Bicicletas, Cochecitos, Skateboards, Monopatines eléctricos
