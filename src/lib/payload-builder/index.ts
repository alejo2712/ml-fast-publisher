import type { Condition, InferenceResult, ListingType, MLAttribute, MLPayload, ProductDraft, ShippingMode } from '@/types';
import { getCategoryConfig } from '@/config/categories/appliances';
import { APPLIANCE_TYPE_LABELS } from '@/lib/inference/dictionaries';

export function buildProductDraft(
  inference: InferenceResult,
  overrides: Partial<ProductDraft> = {}
): ProductDraft {
  const categoryConfig = getCategoryConfig(inference.applianceType);
  const title = overrides.title || inference.suggestedTitle || inference.rawInput.slice(0, 60);

  return {
    title,
    applianceType: inference.applianceType,
    categoryId: categoryConfig?.id || 'unknown',
    mlCategoryId: categoryConfig?.mlCategoryId || 'MLA1051',
    brand: overrides.brand ?? inference.brand,
    model: overrides.model ?? inference.model,
    condition: overrides.condition ?? inference.condition,
    price: overrides.price,
    currency: overrides.currency ?? 'ARS',
    stock: overrides.stock ?? 1,
    description: overrides.description,
    sku: overrides.sku,
    color: overrides.color ?? inference.color,
    voltage: overrides.voltage ?? inference.voltage,
    capacity: overrides.capacity ?? inference.capacity,
    watts: overrides.watts ?? inference.watts,
    technology: overrides.technology ?? inference.technology,
    warranty: overrides.warranty,
    weight: overrides.weight,
    height: overrides.height,
    width: overrides.width,
    depth: overrides.depth,
    images: overrides.images ?? [],
    listingType: overrides.listingType ?? 'gold_special',
    shipping: overrides.shipping ?? {
      mode: 'me2',
      localPickUp: false,
      freeShipping: false,
    },
  };
}

function buildAttributes(draft: ProductDraft): MLAttribute[] {
  const attrs: MLAttribute[] = [];

  if (draft.brand) attrs.push({ id: 'BRAND', value_name: draft.brand });
  if (draft.model) attrs.push({ id: 'MODEL', value_name: draft.model });
  if (draft.color) attrs.push({ id: 'COLOR', value_name: draft.color });
  if (draft.voltage) attrs.push({ id: 'VOLTAGE', value_name: draft.voltage });

  if (draft.capacity) {
    const capNum = parseFloat(draft.capacity);
    const unit = draft.applianceType === 'washing_machine' || draft.applianceType === 'dryer' ? 'kg' : 'L';
    attrs.push({
      id: 'CAPACITY',
      value_name: `${draft.capacity} ${unit}`,
      value_struct: { number: capNum, unit },
    });
  }

  if (draft.watts) {
    attrs.push({
      id: 'POWER_CONSUMPTION',
      value_name: `${draft.watts} W`,
      value_struct: { number: draft.watts, unit: 'W' },
    });
  }

  if (draft.technology) attrs.push({ id: 'COOLING_TYPE', value_name: draft.technology });
  if (draft.height) attrs.push({ id: 'HEIGHT', value_name: `${draft.height} cm`, value_struct: { number: draft.height, unit: 'cm' } });
  if (draft.width) attrs.push({ id: 'WIDTH', value_name: `${draft.width} cm`, value_struct: { number: draft.width, unit: 'cm' } });
  if (draft.depth) attrs.push({ id: 'DEPTH', value_name: `${draft.depth} cm`, value_struct: { number: draft.depth, unit: 'cm' } });
  if (draft.weight) attrs.push({ id: 'WEIGHT', value_name: `${draft.weight} kg`, value_struct: { number: draft.weight, unit: 'kg' } });

  return attrs;
}

function buildDescription(draft: ProductDraft): string {
  if (draft.description) return draft.description;

  const typeLabel = APPLIANCE_TYPE_LABELS[draft.applianceType] || 'Electrodoméstico';
  const parts: string[] = [];

  parts.push(`${typeLabel}${draft.brand ? ` ${draft.brand}` : ''}${draft.model ? ` modelo ${draft.model}` : ''}.`);

  if (draft.capacity) {
    const unit = draft.applianceType === 'washing_machine' || draft.applianceType === 'dryer' ? 'kg' : 'litros';
    parts.push(`Capacidad: ${draft.capacity} ${unit}.`);
  }

  if (draft.technology) parts.push(`Tecnología: ${draft.technology}.`);
  if (draft.color) parts.push(`Color: ${draft.color}.`);
  if (draft.voltage) parts.push(`Voltaje: ${draft.voltage}.`);
  if (draft.watts) parts.push(`Potencia: ${draft.watts} W.`);
  if (draft.warranty) parts.push(`Garantía: ${draft.warranty}.`);

  if (draft.condition === 'used') {
    parts.push('Producto en buen estado. Consultar por fotos adicionales.');
  } else if (draft.condition === 'new') {
    parts.push('Producto nuevo en caja original.');
  }

  return parts.join(' ');
}

export function buildMLPayload(draft: ProductDraft): MLPayload {
  const attributes = buildAttributes(draft);
  const description = buildDescription(draft);

  const payload: MLPayload = {
    title: draft.title,
    category_id: draft.mlCategoryId,
    price: draft.price ?? 0,
    currency_id: draft.currency,
    available_quantity: draft.stock,
    buying_mode: 'buy_it_now',
    listing_type_id: draft.listingType,
    condition: draft.condition ?? 'new',
    description: { plain_text: description },
    // Local images (/uploads/...) are included as-is — valid for dry-run and dev.
    // For real ML publishing, images must be uploaded to a public CDN first.
    pictures: draft.images.map((url) => ({ source: url })),
    attributes,
    shipping: {
      mode: draft.shipping.mode,
      local_pick_up: draft.shipping.localPickUp,
      free_shipping: draft.shipping.freeShipping,
    },
  };

  if (draft.warranty) {
    payload.sale_terms = [{ id: 'WARRANTY_TYPE', value_name: 'Garantía del vendedor' }, { id: 'WARRANTY_TIME', value_name: draft.warranty }];
  }

  return payload;
}
