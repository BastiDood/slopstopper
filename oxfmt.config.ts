import { compose } from '@bastidood/oxfmt-config';
import { CORE } from '@bastidood/oxfmt-config/core';
import { defineConfig } from 'oxfmt';

export default defineConfig(
	compose(CORE, {
		ignorePatterns: ['node_modules', 'dist', 'pnpm-lock.yaml'],
		sortPackageJson: false,
	}),
);
