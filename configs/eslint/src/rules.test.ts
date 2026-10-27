import { type ESLint, Linter } from 'eslint';
import { expect, test } from 'vitest';

import { compose } from './compose/index.ts';
import { core } from './core.ts';
import { PROMISE } from './promise.ts';
import { UNICORN } from './unicorn.ts';

const TYPESCRIPT_PREFIX = '@typescript-eslint/';
const PLUGINS: Record<string, ESLint.Plugin> = {};
const SYNTAX_RULES: Linter.RulesRecord = {};
const TYPE_AWARE_RULE_NAMES: string[] = [];

for (const config of compose(core('.'), UNICORN, PROMISE)) {
	Object.assign(PLUGINS, config.plugins);
	const { rules } = config;
	if (typeof rules === 'undefined') continue;
	for (const name in rules) {
		if (!Object.hasOwn(rules, name)) continue;
		const rule = rules[name];
		if (typeof rule === 'undefined') continue;
		if (name.startsWith(TYPESCRIPT_PREFIX)) TYPE_AWARE_RULE_NAMES.push(name);
		else SYNTAX_RULES[name] = rule;
	}
}

test('ESLint accepts every generated rule that runs without type information', () => {
	const linter = new Linter({ configType: 'flat' });
	expect(() =>
		linter.verify('', [{ plugins: PLUGINS, rules: SYNTAX_RULES }], 'probe.js'),
	).not.toThrow();
});

test('typescript-eslint defines every generated type-aware rule', () => {
	const rules = PLUGINS['@typescript-eslint']?.rules ?? {};
	const missing: string[] = [];
	for (const name of TYPE_AWARE_RULE_NAMES) {
		if (!Object.hasOwn(rules, name.slice(TYPESCRIPT_PREFIX.length))) missing.push(name);
	}
	expect(missing).toEqual([]);
});
