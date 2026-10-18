import type { AiFailureKind, AiRunKind, AiStrategyKind } from '@bookleaf/contracts';

/**
 * Plain-language wording for the AI settings screens. Support staff maintain these
 * settings, so nothing here should need technical knowledge (no "prompt", "model",
 * "tokens", "strategy").
 */

export const SETTING_KIND: Record<AiStrategyKind, { label: string; explain: string }> = {
  CLASSIFICATION: {
    label: 'Category & Priority',
    explain:
      'How AI decides which category a new ticket belongs to and its priority (Critical, High, Medium or Low). There is one setting for all tickets.',
  },
  PRIORITY: {
    label: 'Priority',
    explain:
      'Keeps serious tickets at a minimum priority — one setting per category. Priority rules are on the Category & Priority setting.',
  },
  RESPONSE: {
    label: 'Writing replies',
    explain:
      'How AI writes draft replies for your team to review — one setting per category. Drafts are never sent without a person checking them.',
  },
};

/**
 * How settings are grouped on the AI settings page. Category and priority are one setting
 * because AI decides both together, in a single step; opening it shows its Category and
 * Priority rules. The per-category priority settings only hold the hidden keyword safety
 * net, so they aren't listed.
 */
export type SettingGroup = 'TRIAGE' | 'RESPONSE';

export const SETTING_GROUPS: Record<
  SettingGroup,
  { label: string; explain: string; kinds: AiStrategyKind[] }
> = {
  TRIAGE: {
    label: 'Category & Priority',
    explain:
      'One setting decides both the category and the priority (Critical, High, Medium or Low) of every new ticket. Open it to change its Category and Priority rules.',
    kinds: ['CLASSIFICATION'],
  },
  RESPONSE: {
    label: 'Writing replies',
    explain: SETTING_KIND.RESPONSE.explain,
    kinds: ['RESPONSE'],
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
