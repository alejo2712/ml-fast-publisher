/**
 * Types for centralized environment validation.
 * Safe to import from both server and client modules.
 */

export type EnvVarStatus = 'ok' | 'missing' | 'invalid' | 'default';

export interface EnvVarResult {
  key: string;
  status: EnvVarStatus;
  required: boolean;
  description: string;
  /** Only set for non-sensitive vars — never for secrets */
  displayValue?: string;
  warning?: string;
}

export interface EnvValidationResult {
  /** True when all required vars are present and valid */
  valid: boolean;
  errors: string[];
  warnings: string[];
  vars: EnvVarResult[];
}
