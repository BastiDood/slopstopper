import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/*.ts', 'src/compose/index.ts', '!src/*.test.ts'],
	dts: true,
});
