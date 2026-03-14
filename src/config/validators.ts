import { logger } from '../logger.js';

export function validateConfig<T>(
  value: T,
  validator: (val: T) => boolean,
  defaultValue: T,
  configName: string,
): T {
  if (validator(value)) {
    return value;
  }
  logger.warn(
    { configName, value, defaultValue },
    'Invalid config value, using default',
  );
  return defaultValue;
}

export function validateInteger(
  value: string | number,
  min: number,
  max: number,
): boolean {
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max;
}

export function validateString(
  value: string,
  minLength: number = 0,
  maxLength: number = 100,
): boolean {
  return (
    typeof value === 'string' &&
    value.length >= minLength &&
    value.length <= maxLength
  );
}

export function validateBoolean(value: any): boolean {
  return (
    value === true || value === false || value === 'true' || value === 'false'
  );
}

export function validatePath(value: string): boolean {
  return typeof value === 'string' && value.length > 0;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
