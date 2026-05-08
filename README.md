# FastPublisher — Publicá en Mercado Libre más rápido

MVP de publicación asistida para Mercado Libre, enfocado en electrodomésticos.

## Setup

```bash
cp .env.example .env.local   # configurar variables (ver abajo)
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000)

---

## Variables de entorno

Copiá `.env.example` a `.env.local` y completá los valores:

| Variable | Descripción |
|---|---|
| `MERCADOLIBRE_CLIENT_ID` | ID de tu app ML (developers.mercadolibre.com.ar) |
| `MERCADOLIBRE_CLIENT_SECRET` | Secret de tu app ML |
| `MERCADOLIBRE_REDIRECT_URI` | `http://localhost:3000/api/ml/callback` |
| `MERCADOLIBRE_SITE_ID` | `MLA` (Argentina), `MLB` (Brasil), `MLM` (México) |
| `MERCADOLIBRE_DRY_RUN` | `true` (default) = simula, nunca publica. `false` = publica de verdad. |

---

## Modo dry-run (default)

Por seguridad, `MERCADOLIBRE_DRY_RUN=true` por defecto.

En dry-run:
- El botón "Publicar" simula el flujo completo sin llamar a la API de ML.
- El payload se valida y se muestra el resultado simulado.
- **No se publica nada.**

Para publicar de verdad: configurar credenciales + poner `MERCADOLIBRE_DRY_RUN=false`.

---

## Conectar Mercado Libre (OAuth)

1. Crear app en https://developers.mercadolibre.com.ar/apps/new
2. Configurar redirect URI: `http://localhost:3000/api/ml/callback`
3. Copiar Client ID y Secret a `.env.local`
4. Ir a `http://localhost:3000/api/ml/auth` → ML pide autorización
5. Después de aprobar, redirige al app con `?ml_connected=true`

**Los tokens se guardan en memoria** — se pierden al reiniciar el servidor. Para producción, reemplazar el store en `src/lib/mercadolibre/auth.ts`.

---

## Flujo de un producto

1. Escribís: `Heladera Samsung no frost 320 litros blanca usada`
2. El sistema infiere: marca, categoría, condición, capacidad, color, tecnología
3. Completás solo los campos faltantes (precio, modelo, foto)
4. Revisás el JSON → Publicás (o dry-run)

---

## Flujo bulk (CSV)

1. Descargás la plantilla CSV desde el tab "Carga masiva"
2. Completás filas (una por producto)
3. Subís el CSV o pegás los datos
4. El sistema procesa cada fila: inferencia + validación
5. Ves estado por fila: ✓ listo / ⚠ advertencias / ✗ error
6. "Publicar todos los válidos" → confirmás → publica (o dry-run)

### Columna mínima requerida
`descripcion_corta` + `precio` — todo lo demás se infiere o es opcional.

---

## Validación

El sistema bloquea export/publish hasta que:
- título: 10–60 caracteres, sin garbage
- marca: mínimo 2 caracteres, no placeholder
- condición: `new`, `used` o `refurbished`
- precio: número positivo > 100
- stock: entero positivo
- imágenes: URLs válidas con https://

Errores se muestran campo por campo en el tab "Validación".

---

## Arquitectura

```
src/
  config/categories/     # Schemas de categorías (config-driven)
  lib/
    inference/           # Motor determinístico (adaptador intercambiable)
    payload-builder/     # Construye payload ML
    validation/          # validateDraft() — strict rules + field errors
    csv/                 # Parser + template generator
    mercadolibre/        # auth, client, publish (SERVER-SIDE ONLY)
  app/api/ml/            # Next.js API routes — ML calls nunca van al cliente
  components/
    AssistedPublisher/   # Flujo single-product
    MissingFields/       # Formulario con errores por campo + status banner
    PublishButton/       # Modal de confirmación + dry-run indicator
    BulkUpload/          # Carga masiva con publish por fila
    ProductPreview/      # Vista previa editable
    JsonPreview/         # Preview + export del JSON
    ModeShell/           # Toggle single / bulk
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
export const inferenceAdapter = new ClaudeInferenceAdapter();
```

---

## Categorías soportadas

**Grandes:** Heladera, Lavarropas, Secadora, Lavavajillas, Horno, Cocina, Freezer

**Pequeños:** Microondas, Freidora de Aire, Licuadora, Cafetera, Pava Eléctrica, Aspiradora, Plancha, Tostadora

**Roadmap:** Celulares, Colchones, Sommiers, Sábanas, Almohadas, Bicicletas, Cochecitos, Skateboards, Monopatines eléctricos
