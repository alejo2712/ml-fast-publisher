# FastPublisher — Publicá en Mercado Libre más rápido

MVP de publicación asistida para Mercado Libre, enfocado en electrodomésticos.

## ¿Qué hace?

Reducís el esfuerzo de publicar un producto de **10+ pasos** a **3 pasos**:

1. Escribís el nombre del producto
2. El sistema infiere marca, categoría, condición, capacidad, color, etc.
3. Completás solo los campos que faltan y exportás el JSON listo para ML

## Setup

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000)

## Ejemplo

Input: `Heladera Samsung no frost 320 litros blanca usada`

El sistema detecta:
- Categoría: Heladera (MLA1577)
- Marca: Samsung
- Tecnología: No Frost
- Capacidad: 320 L
- Color: Blanco
- Condición: Usado
- Título sugerido: `Heladera Samsung No Frost 320 L Blanco Usado`

Luego te pide solo los campos faltantes (precio, modelo, foto) y genera el JSON listo para la API de ML.

## Stack

- Next.js 15 + TypeScript
- Tailwind CSS
- Motor de inferencia determinístico (reemplazable por Claude/GPT)
- Sin backend — todo corre en el cliente

## Arquitectura

```
src/
  config/categories/     # Schemas de categorías (config-driven)
  lib/
    inference/           # Motor de inferencia (adaptador intercambiable)
    payload-builder/     # Construye el payload ML
    validation/          # Detecta campos faltantes
  types/                 # Tipos compartidos
  components/
    AssistedPublisher/   # Flujo principal
    ProductPreview/      # Vista previa editable
    MissingFields/       # Formulario de campos faltantes
    JsonPreview/         # Preview + export del JSON
docs/
  research/              # Investigación sobre estructura ML
CLAUDE.md                # Contexto del proyecto para Claude Code
```

## Agregar nueva categoría

1. Agregar en `src/config/categories/appliances.ts`
2. Agregar keywords en `src/lib/inference/dictionaries.ts`
3. Listo — todo lo demás es automático

## TODO: Integración con IA

El adaptador de inferencia está en `src/lib/inference/index.ts`.
Para reemplazar el motor determinístico:

```typescript
export class ClaudeInferenceAdapter implements InferenceAdapter {
  async infer(input: string): Promise<InferenceResult> {
    // Llamar a Claude API con el input
    // Parsear respuesta al formato InferenceResult
  }
}
export const inferenceAdapter = new ClaudeInferenceAdapter();
```

## TODO: Integración con ML API

Ver `docs/research/ml-listing-structure.md` para la estructura del payload.
Requiere OAuth con ML Developer credentials.

## Categorías soportadas (MVP)

**Grandes:** Heladera, Lavarropas, Secadora, Lavavajillas, Horno, Cocina, Freezer

**Pequeños:** Microondas, Freidora de Aire, Licuadora, Cafetera, Pava Eléctrica, Aspiradora, Plancha, Tostadora

## Categorías futuras (roadmap)

Celulares, Colchones, Sommiers, Sábanas, Almohadas, Bicicletas, Cochecitos, Skateboards, Monopatines eléctricos
