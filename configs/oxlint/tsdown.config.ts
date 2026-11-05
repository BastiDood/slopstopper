import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: [
		'src/*.ts',
		'src/*/index.ts',
		'src/react/*.ts',
		'src/react/tanstack/*.ts',
		'src/tanstack/*.ts',
	],
	dts: true,
});
