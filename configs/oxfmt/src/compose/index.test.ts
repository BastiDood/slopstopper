import { describe, expect, test } from 'vitest';

import { compose } from './index.ts';

describe('compose', () => {
	test('lets later options win', () => {
		expect(compose({ printWidth: 80, useTabs: true }, { printWidth: 100 })).toMatchObject({
			printWidth: 100,
			useTabs: true,
		});
	});

	test('concatenates ignore patterns and overrides instead of replacing them', () => {
		const yaml = { files: ['**/*.yaml'], options: { useTabs: false } };
		const markdown = { files: ['**/*.md'], options: { proseWrap: 'never' as const } };
		expect(
			compose(
				{ ignorePatterns: ['dist'], overrides: [yaml] },
				{ ignorePatterns: ['coverage'], overrides: [markdown] },
			),
		).toEqual({ ignorePatterns: ['dist', 'coverage'], overrides: [yaml, markdown] });
	});
});
