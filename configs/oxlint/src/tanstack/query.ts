import type { Entry } from '#compose/index.ts';

/** TanStack Query rules that apply to every framework adapter. */
export const TANSTACK_QUERY = {
	config: {
		jsPlugins: [{ name: 'slopstopper', specifier: '@bastidood/eslint-plugin-slopstopper' }],
		rules: {
			'slopstopper/no-defaulted-query-key': 'error',
			'slopstopper/no-mutate-callback-cache-update': 'error',
			'slopstopper/no-standalone-mutate-async': 'error',
			'slopstopper/prefer-query-key-context': 'error',
		},
	},
} satisfies Entry;
