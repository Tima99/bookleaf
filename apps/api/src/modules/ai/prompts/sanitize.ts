import { truncate } from '@bookleaf/utils';

/**
 * Prepares untrusted author text for inclusion inside XML-style prompt sections.
 * Angle brackets are neutralised so a ticket cannot close our <ticket> tag and smuggle
 * text into an "instructions" position; control characters are stripped; length is
 * bounded for cost control.
 */
export function untrusted(text: string, maxChars: number): string {
  const cleaned = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncate(cleaned, maxChars);
}

export function fact(
  label: string,
  value: string | number | null | undefined,
  unknown = 'not available',
): string {
  return `${label}: ${value === null || value === undefined || value === '' ? unknown : value}`;
}
