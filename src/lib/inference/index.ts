import type { ApplianceType, Condition, InferenceResult } from '@/types';
import {
  APPLIANCE_TYPE_KEYWORDS,
  APPLIANCE_TYPE_LABELS,
  BRAND_KEYWORDS,
  COLOR_KEYWORDS,
  CONDITION_KEYWORDS,
  VOLTAGE_KEYWORDS,
} from './dictionaries';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function detectApplianceType(input: string): { type: ApplianceType; confidence: number } {
  const normalized = normalize(input);
  for (const { type, keywords } of APPLIANCE_TYPE_KEYWORDS) {
    for (const keyword of keywords) {
      if (normalized.includes(normalize(keyword))) {
        return { type, confidence: 0.9 };
      }
    }
  }
  return { type: 'unknown', confidence: 0.1 };
}

function detectBrand(input: string): string | undefined {
  const normalized = normalize(input);
  for (const [keyword, brand] of Object.entries(BRAND_KEYWORDS)) {
    const pattern = new RegExp(`\\b${normalize(keyword)}\\b`, 'i');
    if (pattern.test(normalized)) return brand;
  }
  return undefined;
}

function detectCondition(input: string): Condition | undefined {
  const normalized = normalize(input);
  for (const [keyword, condition] of Object.entries(CONDITION_KEYWORDS)) {
    if (normalized.includes(normalize(keyword))) return condition;
  }
  return undefined;
}

function detectColor(input: string): string | undefined {
  const normalized = normalize(input);
  for (const [keyword, color] of Object.entries(COLOR_KEYWORDS)) {
    const pattern = new RegExp(`\\b${normalize(keyword)}\\b`, 'i');
    if (pattern.test(normalized)) return color;
  }
  return undefined;
}

function detectVoltage(input: string): string | undefined {
  const normalized = normalize(input);
  for (const [keyword, voltage] of Object.entries(VOLTAGE_KEYWORDS)) {
    if (normalized.includes(normalize(keyword))) return voltage;
  }
  return undefined;
}

function detectCapacity(input: string): { value: string; unit: 'L' | 'kg' } | undefined {
  // Match patterns like "320 litros", "320L", "8 kg", "8kg"
  const litrosMatch = input.match(/(\d+(?:[.,]\d+)?)\s*(?:litros?|lts?|l\b)/i);
  if (litrosMatch) return { value: litrosMatch[1], unit: 'L' };
  const kgMatch = input.match(/(\d+(?:[.,]\d+)?)\s*(?:kilos?|kg\b)/i);
  if (kgMatch) return { value: kgMatch[1], unit: 'kg' };
  return undefined;
}

function detectWatts(input: string): number | undefined {
  const match = input.match(/(\d+(?:[.,]\d+)?)\s*(?:watts?|w\b)/i);
  if (match) return parseFloat(match[1].replace(',', '.'));
  return undefined;
}

function detectModel(input: string, brand?: string): string | undefined {
  // Look for alphanumeric model codes (letters+numbers combo, at least 4 chars)
  const modelPattern = /\b([A-Z]{1,4}\d{2,}[A-Z0-9]*|[A-Z]{2,}\d{2,}[A-Z0-9]*)\b/;
  const words = input.split(/\s+/);
  for (const word of words) {
    if (modelPattern.test(word) && (!brand || !word.toLowerCase().includes(brand.toLowerCase()))) {
      return word.toUpperCase();
    }
  }
  return undefined;
}

function detectTechnology(input: string, applianceType: ApplianceType): string | undefined {
  const normalized = normalize(input);
  if (applianceType === 'refrigerator') {
    if (normalized.includes('no frost') || normalized.includes('nofrost')) return 'No Frost';
    if (normalized.includes('frost free') || normalized.includes('frostfree')) return 'Frost Free';
  }
  if (applianceType === 'washing_machine') {
    if (normalized.includes('carga frontal') || normalized.includes('front load')) return 'Carga Frontal';
    if (normalized.includes('carga superior') || normalized.includes('top load')) return 'Carga Superior';
  }
  if (applianceType === 'coffee_maker') {
    if (normalized.includes('capsul') || normalized.includes('nespresso') || normalized.includes('dolce')) return 'Cápsulas';
    if (normalized.includes('espresso')) return 'Espresso';
    if (normalized.includes('goteo') || normalized.includes('filtro')) return 'Goteo';
  }
  return undefined;
}

function buildSuggestedTitle(result: Partial<InferenceResult>): string {
  const parts: string[] = [];
  if (result.applianceType && result.applianceType !== 'unknown') {
    parts.push(APPLIANCE_TYPE_LABELS[result.applianceType]);
  }
  if (result.brand) parts.push(result.brand);
  if (result.technology) parts.push(result.technology);
  if (result.capacity) {
    parts.push(`${result.capacity} ${result.capacityUnit}`);
  }
  if (result.color) parts.push(result.color);
  if (result.condition === 'used') parts.push('Usado');
  if (result.condition === 'refurbished') parts.push('Reacondicionado');
  return parts.join(' ').slice(0, 60);
}

export interface InferenceAdapter {
  infer(input: string): Promise<InferenceResult>;
}

export class DeterministicInferenceAdapter implements InferenceAdapter {
  async infer(input: string): Promise<InferenceResult> {
    const { type: applianceType, confidence } = detectApplianceType(input);
    const brand = detectBrand(input);
    const condition = detectCondition(input);
    const color = detectColor(input);
    const voltage = detectVoltage(input);
    const capacityResult = detectCapacity(input);
    const watts = detectWatts(input);
    const model = detectModel(input, brand);
    const technology = detectTechnology(input, applianceType);

    const partial: Partial<InferenceResult> = {
      applianceType,
      brand,
      condition,
      color,
      voltage,
      capacity: capacityResult?.value,
      capacityUnit: capacityResult?.unit,
      watts,
      model,
      technology,
    };

    const suggestedTitle = buildSuggestedTitle(partial);

    return {
      applianceType,
      brand,
      model,
      condition,
      color,
      voltage,
      capacity: capacityResult?.value,
      capacityUnit: capacityResult?.unit,
      watts,
      technology,
      suggestedTitle,
      confidence,
      rawInput: input,
    };
  }
}

// Singleton — swap this for an AI adapter when ready
export const inferenceAdapter: InferenceAdapter = new DeterministicInferenceAdapter();

export async function inferProduct(input: string): Promise<InferenceResult> {
  return inferenceAdapter.infer(input);
}
