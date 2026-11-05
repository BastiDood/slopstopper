import { TANSTACK_QUERY as OXLINT_TANSTACK_QUERY } from '@bastidood/oxlint-config/tanstack/query';
import type { Linter } from 'eslint';

import type { Entry } from '#compose/index.ts';
import { writeEslintRules } from '#convert/index.ts';

const RULES: Linter.RulesRecord = {};
writeEslintRules(RULES, OXLINT_TANSTACK_QUERY.config.rules);

/** TanStack Query rules for every framework adapter, generated from the Oxlint `tanstack/query` entry point. */
export const TANSTACK_QUERY: Entry = {
	configs: [{ name: '@bastidood/eslint-config/tanstack/query', rules: RULES }],
};
