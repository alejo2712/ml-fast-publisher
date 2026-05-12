export type Condition = 'new' | 'used' | 'refurbished';
export type ListingType = 'gold_special' | 'gold_pro' | 'gold' | 'silver' | 'bronze' | 'free';
export type ShippingMode = 'me2' | 'custom' | 'not_specified';

export type ApplianceType =
  | 'refrigerator'
  | 'washing_machine'
  | 'dryer'
  | 'dishwasher'
  | 'oven'
  | 'stove'
  | 'freezer'
  | 'microwave'
  | 'air_fryer'
  | 'blender'
  | 'mixer'
  | 'coffee_maker'
  | 'electric_kettle'
  | 'vacuum_cleaner'
  | 'iron'
  | 'toaster'
  | 'unknown';

export interface AttributeValue {
  id: string;
  value_name: string;
  value_id?: string;
  value_struct?: { number: number; unit: string };
}

export interface AttributeSchema {
  id: string;
  label: string;
  required: boolean;
  type: 'text' | 'number' | 'select' | 'boolean';
  unit?: string;
  options?: string[];
  placeholder?: string;
}

export interface CategoryConfig {
  id: string;
  name: string;
  mlCategoryId: string;
  applianceType: ApplianceType;
  keywords: string[];
  attributes: AttributeSchema[];
}

export interface InferenceResult {
  applianceType: ApplianceType;
  brand?: string;
  model?: string;
  condition?: Condition;
  color?: string;
  voltage?: string;
  capacity?: string;
  capacityUnit?: 'L' | 'kg';
  watts?: number;
  technology?: string;
  suggestedTitle?: string;
  confidence: number;
  rawInput: string;
}

export interface ProductDraft {
  title: string;
  applianceType: ApplianceType;
  categoryId: string;
  mlCategoryId: string;
  brand?: string;
  model?: string;
  condition?: Condition;
  price?: number;
  currency: 'ARS' | 'USD';
  stock: number;
  description?: string;
  sku?: string;
  color?: string;
  voltage?: string;
  capacity?: string;
  watts?: number;
  technology?: string;
  warranty?: string;
  weight?: number;
  height?: number;
  width?: number;
  depth?: number;
  images: string[];
  listingType: ListingType;
  shipping: {
    mode: ShippingMode;
    localPickUp: boolean;
    freeShipping: boolean;
  };
  // Extended attributes for ML API compatibility
  gtin?: string;
  manufacturer?: string;
  powerSupplyType?: string;
  requiresAssembly?: boolean;
  includesAssemblyManual?: boolean;
  /** User-provided ML category ID override — skips category prediction when present */
  officialCategoryId?: string;
}

export interface MLAttribute {
  id: string;
  value_name: string;
  value_id?: string;
  value_struct?: { number: number; unit: string };
}

export interface MLPayload {
  title: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: 'buy_it_now';
  listing_type_id: ListingType;
  condition: Condition;
  description: { plain_text: string };
  pictures: { source: string }[];
  attributes: MLAttribute[];
  shipping: {
    mode: ShippingMode;
    local_pick_up: boolean;
    free_shipping: boolean;
    dimensions?: string;
  };
  sale_terms?: { id: string; value_name: string }[];
}

export interface MissingField {
  id: string;
  label: string;
  required: boolean;
  type: AttributeSchema['type'];
  unit?: string;
  options?: string[];
  placeholder?: string;
}

export interface PublishingSession {
  input: string;
  inference: InferenceResult | null;
  draft: ProductDraft | null;
  payload: MLPayload | null;
  missingFields: MissingField[];
  step: 'input' | 'inferring' | 'review' | 'complete';
}
