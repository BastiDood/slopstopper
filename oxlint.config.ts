import { compose } from '@bastidood/oxlint-config';
import { CORE } from '@bastidood/oxlint-config/core';
import { NODE } from '@bastidood/oxlint-config/node';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [compose(CORE, NODE)],
	options: { respectEslintDisableDirectives: false },
});
