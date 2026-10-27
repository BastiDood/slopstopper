import { compose } from '@bastidood/oxlint-config/compose';
import { CORE } from '@bastidood/oxlint-config/core';
import { PROMISE } from '@bastidood/oxlint-config/promise';
import { UNICORN } from '@bastidood/oxlint-config/unicorn';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [compose(CORE, UNICORN, PROMISE)],
	options: {
		typeAware: true,
		denyWarnings: true,
		respectEslintDisableDirectives: false,
	},
});
