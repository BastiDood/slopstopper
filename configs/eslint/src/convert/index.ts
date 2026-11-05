import type { ESLint, Linter } from 'eslint';
import {
	correctnessRules,
	correctnessTypeAwareRules,
	nurseryRules,
	nurseryTypeAwareRules,
	pedanticRules,
	pedanticTypeAwareRules,
	perfRules,
	restrictionRules,
	restrictionTypeAwareRules,
	styleRules,
	styleTypeAwareRules,
	suspiciousRules,
	suspiciousTypeAwareRules,
} from 'eslint-plugin-oxlint/rules-by-category';
import { reactHooksRules } from 'eslint-plugin-oxlint/rules-by-scope';
import type { AllowWarnDeny, OxlintConfig } from 'oxlint';

type Categories = NonNullable<OxlintConfig['categories']>;
type Category = keyof Categories;
type OxlintRules = NonNullable<OxlintConfig['rules']>;

export class UnsupportedSeverityError extends Error {
	constructor(severity: number) {
		super(`Oxlint severity ${severity} has no ESLint equivalent.`);
		this.name = 'UnsupportedSeverityError';
	}
}

const ESLINT = ['eslint'];
const IMPORT = ['import'];
const JSDOC = ['jsdoc'];
const JSX_A11Y = ['jsx-a11y'];
const NODE = ['n'];
const PROMISE = ['promise'];
const REACT = ['react', 'react-hooks'];
const REACT_PERF = ['react-perf'];
const TYPESCRIPT = ['@typescript-eslint'];
const UNICORN = ['unicorn'];
const VITEST = ['vitest'];

/** Write the ESLint equivalents of explicitly configured Oxlint rules, skipping rules that ESLint cannot run. */
export function writeEslintRules(target: Linter.RulesRecord, rules: OxlintRules) {
	for (const name in rules) {
		if (!Object.hasOwn(rules, name)) continue;
		const rule = rules[name];
		if (typeof rule === 'undefined') continue;
		const eslintName = toEslintRuleName(name);
		if (isSupportedInEslint(eslintName)) target[eslintName] = toEslintRuleEntry(rule);
	}
}

export function toEslintRuleName(name: string) {
	const separator = name.indexOf('/');
	if (separator === -1) return name;

	const rule = name.slice(separator + 1);
	switch (name.slice(0, separator)) {
		case 'eslint-js':
			return rule;
		case 'typescript':
			return `@typescript-eslint/${rule}`;
		case 'node':
			return `n/${rule}`;
		case 'unicorn':
			return renamedInEslint(name);
		case 'react': {
			const hook = `react-hooks/${rule}`;
			return Object.hasOwn(reactHooksRules, hook) ? hook : name;
		}
		default:
			return name;
	}
}

function toEslintRuleEntry(rule: NonNullable<OxlintRules[string]>) {
	return Array.isArray(rule)
		? ([toEslintSeverity(rule[0]), ...rule.values().drop(1)] satisfies Linter.RuleEntry)
		: toEslintSeverity(rule);
}

// The published category lists, each indexed once by ESLint namespace, then rule names.
const CORRECTNESS = indexByNamespace(correctnessRules, correctnessTypeAwareRules);
const NURSERY = indexByNamespace(nurseryRules, nurseryTypeAwareRules);
const PEDANTIC = indexByNamespace(pedanticRules, pedanticTypeAwareRules);
const PERF = indexByNamespace(perfRules);
const RESTRICTION = indexByNamespace(restrictionRules, restrictionTypeAwareRules);
const STYLE = indexByNamespace(styleRules, styleTypeAwareRules);
const SUSPICIOUS = indexByNamespace(suspiciousRules, suspiciousTypeAwareRules);

function indexByNamespace(...ruleSets: Record<string, 'off'>[]) {
	const byNamespace = new Map<string, string[]>();
	for (const ruleSet of ruleSets) {
		for (const name in ruleSet) {
			if (!Object.hasOwn(ruleSet, name) || !isSupportedInEslint(name)) continue;
			const namespace = namespaceOf(name);
			const eslintName = renamedInEslint(name);
			const names = byNamespace.get(namespace);
			if (typeof names === 'undefined') byNamespace.set(namespace, [eslintName]);
			else names.push(eslintName);
		}
	}
	return byNamespace;
}

/**
 * Whether ESLint can run a rule, given its ESLint name. The conversion prunes unsupported rules: Oxlint-only rules,
 * and rules or options that the ESLint 10 plugins lack.
 */
function isSupportedInEslint(eslintName: string) {
	switch (eslintName) {
		// `eslint-plugin-import-x` lacks the `prefer-top-level-if-only-type-imports` mode. Its behavior is already
		// enforced by `@typescript-eslint/no-import-type-side-effects` and `no-duplicate-imports`.
		case 'import/consistent-type-specifier-style':
			return false;
		// No ESLint plugin implements the Oxlint `oxc` rules.
		default:
			return !eslintName.startsWith('oxc/');
	}
}

function namespaceOf(eslintName: string) {
	const separator = eslintName.lastIndexOf('/');
	return separator === -1 ? 'eslint' : eslintName.slice(0, separator);
}

/** Rename the rules that an ESLint 10 plugin publishes under a different name than Oxlint's `eslint-plugin-oxlint` lists. */
function renamedInEslint(eslintName: string) {
	switch (eslintName) {
		case 'unicorn/no-array-for-each':
			return 'unicorn/no-for-each';
		default:
			return eslintName;
	}
}

/**
 * Hand each configured ESLint core rule to the typescript-eslint extension of the same name, which understands
 * TypeScript syntax and types. An explicit Oxlint `typescript/*` rule configures its extension directly, and a
 * deprecated extension leaves the core rule in charge.
 */
export function writeExtensionRules(
	target: Linter.RulesRecord,
	rules: OxlintRules,
	extensions: ESLint.Plugin['rules'],
) {
	if (typeof extensions === 'undefined') return;
	for (const name in extensions) {
		if (!Object.hasOwn(extensions, name)) continue;
		const entry = target[name];
		if (typeof entry === 'undefined') continue;
		const extension = `@typescript-eslint/${name}`;
		const deprecated = extensions[name]?.meta?.deprecated;
		if (typeof deprecated !== 'undefined' && deprecated !== false) {
			if (Object.hasOwn(target, extension)) target[extension] = 'off';
		} else if (Object.hasOwn(rules, `typescript/${name}`)) {
			target[name] = 'off';
		} else {
			target[extension] = entry;
			target[name] = 'off';
		}
	}
}

/** Write the ESLint rules that the configured Oxlint categories enable for the given Oxlint plugins. */
export function writeCategoryRules(
	target: Linter.RulesRecord,
	{ correctness, nursery, pedantic, perf, restriction, style, suspicious }: Categories,
	plugins: Iterable<string>,
) {
	writeCategory(target, CORRECTNESS, correctness, plugins);
	writeCategory(target, NURSERY, nursery, plugins);
	writeCategory(target, PEDANTIC, pedantic, plugins);
	writeCategory(target, PERF, perf, plugins);
	writeCategory(target, RESTRICTION, restriction, plugins);
	writeCategory(target, STYLE, style, plugins);
	writeCategory(target, SUSPICIOUS, suspicious, plugins);
}

function writeCategory(
	target: Linter.RulesRecord,
	byNamespace: Map<string, string[]>,
	severity: Categories[Category],
	plugins: Iterable<string>,
) {
	if (typeof severity === 'undefined') return;
	writeNamespaceRules(target, byNamespace, plugins, toEslintSeverity(severity));
}

function writeNamespaceRules(
	target: Linter.RulesRecord,
	byNamespace: Map<string, string[]>,
	plugins: Iterable<string>,
	severity: Linter.RuleSeverity,
) {
	for (const plugin of plugins) {
		const namespaces = namespacesOf(plugin);
		if (namespaces === null) continue;
		for (const namespace of namespaces) {
			const names = byNamespace.get(namespace);
			if (typeof names === 'undefined') continue;
			for (const name of names) target[name] = severity;
		}
	}
}

/** ESLint rule namespaces that an Oxlint plugin covers. */
function namespacesOf(plugin: string) {
	switch (plugin) {
		case 'eslint':
			return ESLINT;
		case 'import':
			return IMPORT;
		case 'jsdoc':
			return JSDOC;
		case 'jsx-a11y':
			return JSX_A11Y;
		case 'node':
			return NODE;
		case 'promise':
			return PROMISE;
		case 'react':
			return REACT;
		case 'react-perf':
			return REACT_PERF;
		case 'typescript':
			return TYPESCRIPT;
		case 'unicorn':
			return UNICORN;
		case 'vitest':
			return VITEST;
		default:
			return null;
	}
}

function toEslintSeverity(severity: AllowWarnDeny): Linter.RuleSeverity {
	switch (severity) {
		case 'deny':
		case 'error':
			return 'error';
		case 'allow':
		case 'off':
			return 'off';
		case 'warn':
			return 'warn';
		default:
			switch (severity) {
				case 0:
				case 1:
				case 2:
					return severity;
				default:
					throw new UnsupportedSeverityError(severity);
			}
	}
}
