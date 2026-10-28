import type { OxfmtConfig } from 'oxfmt';

/** Four-column tabs, single quotes, 100 columns, and sorted imports. YAML forbids tabs, so YAML files indent with two spaces. */
export const CORE = {
	arrowParens: 'avoid',
	printWidth: 100,
	singleQuote: true,
	sortImports: true,
	tabWidth: 4,
	trailingComma: 'all',
	useTabs: true,
	overrides: [
		{ files: ['**/*.yaml', '**/*.yml'], options: { useTabs: false, tabWidth: 2 } },
		{ files: ['**/*.md'], options: { tabWidth: 2 } },
	],
} satisfies OxfmtConfig;
