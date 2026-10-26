import baseline from '@bastidood/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [baseline],
	options: {
		typeAware: true,
		respectEslintDisableDirectives: false,
	},
});
