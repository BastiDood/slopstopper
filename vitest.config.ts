import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			// Cheap unit tests share module state across worker threads.
			{
				test: {
					name: 'test',
					include: ['**/*.test.ts'],
					isolate: false,
					pool: 'threads',
				},
			},
			// Specs need dedicated worker processes, e.g., Oxlint's `RuleTester` loads a native binding per process.
			{
				test: {
					name: 'spec',
					include: ['**/*.spec.ts'],
					isolate: false,
					pool: 'forks',
				},
			},
		],
	},
});
