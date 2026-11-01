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
			// Specs run in a worker process, e.g., Oxlint's `RuleTester` loads a native binding that crashes in threads.
			{
				test: {
					name: 'spec',
					include: ['**/*.spec.ts'],
					isolate: false,
					pool: 'forks',
					// Each process reserves a 6 GiB parser buffer, which exhausts Windows' commit limit with one process per
					// core. One process also runs fastest, because it imports the rules once for every spec.
					maxWorkers: 1,
					// Vitest runs projects with different worker limits in separate groups.
					sequence: { groupOrder: 1 },
				},
			},
		],
	},
});
