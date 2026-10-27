import type { OxfmtConfig } from 'oxfmt';

type Override = NonNullable<OxfmtConfig['overrides']>[number];

/**
 * Compose formatting configurations into one Oxfmt configuration. Later options win, and the `ignorePatterns` and
 * `overrides` lists are concatenated instead of replaced.
 */
export function compose(...configs: OxfmtConfig[]) {
	const config: OxfmtConfig = {};
	const ignorePatterns: string[] = [];
	const overrides: Override[] = [];
	for (const entry of configs) {
		Object.assign(config, entry);
		const { ignorePatterns: entryIgnorePatterns, overrides: entryOverrides } = entry;
		if (typeof entryIgnorePatterns !== 'undefined') {
			for (const pattern of entryIgnorePatterns) ignorePatterns.push(pattern);
		}
		if (typeof entryOverrides !== 'undefined') {
			for (const override of entryOverrides) overrides.push(override);
		}
	}
	config.ignorePatterns = ignorePatterns;
	config.overrides = overrides;
	return config;
}
