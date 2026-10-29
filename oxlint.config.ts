import { compose } from '@bastidood/oxlint-config';
import { CORE } from '@bastidood/oxlint-config/core';
import { NODE } from '@bastidood/oxlint-config/node';
import { PROMISE } from '@bastidood/oxlint-config/promise';
import { UNICORN } from '@bastidood/oxlint-config/unicorn';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [compose(CORE, NODE, UNICORN, PROMISE)],
	options: { respectEslintDisableDirectives: false },
});
