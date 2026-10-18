import type { AiFailureKind, AiRunKind, AiStrategyKind } from '@bookleaf/contracts';

/**
 * Plain-language wording for the AI settings screens. Support staff maintain these
 * settings, so nothing here should need technical knowledge (no "prompt", "model",
 * "tokens", "strategy").
 */

export const SETTING_KIND: Record<AiStrategyKind, { label: string; explain: string }> = {
  CLASSIFICATION: {
    label: 'Sorting tickets',
    explain:
      'How AI decides which category a new ticket belongs to. There is one setting for all tickets.',
  },
  PRIORITY: {
    label: 'Setting urgency',
    explain:
      'How AI decides how urgent a ticket is (Critical, High, Medium or Low) — one setting per category.',
  },
  RESPONSE: {
    label: 'Writing replies',
    explain:
      'How AI writes draft replies for your team to review — one setting per category. Drafts are never sent without a person checking them.',
  },
};

export const ACTIVITY_KIND: Record<AiRunKind, string> = {
  TRIAGE: 'Sorted a ticket',
  DRAFT: 'Drafted a reply',
  STRATEGY_TEST: 'Tried a setting',
};

export const AI_PROBLEM: Record<AiFailureKind, string> = {
  NOT_CONFIGURED: 'AI is switched off',
  RATE_LIMITED: 'AI was busy',
  TIMEOUT: 'AI took too long',
  PROVIDER_ERROR: 'AI ran into a problem',
  INVALID_OUTPUT: 'AI gave an unclear answer',
  CIRCUIT_OPEN: 'AI was paused after some errors',
};

/** Reply length presets mapped to the output budget (maxOutputTokens). */
export const REPLY_LENGTHS = [
  { value: 600, label: 'Short' },
  { value: 1200, label: 'Standard' },
  { value: 2000, label: 'Detailed' },
] as const;
