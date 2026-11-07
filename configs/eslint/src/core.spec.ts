import { join } from 'node:path';

import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

import { compose } from './compose/index.ts';
import { CORE } from './core.ts';

test('`import/no-cycle` reports a cycle between TypeScript modules on both modules', async () => {
	const eslint = new ESLint({
		cwd: join(import.meta.dirname, 'testing', 'fixture'),
		overrideConfigFile: true,
		overrideConfig: [
			{ files: ['**/*.ts'] },
			...compose(CORE),
			// `import/no-cycle` needs no type information. The project service is a process-wide singleton that the
			// first parse configures, so creating it here would break later specs that configure their own.
			{ languageOptions: { parserOptions: { projectService: false } } },
		],
		ruleFilter: ({ ruleId }) => ruleId === 'import/no-cycle',
	});
	const results = await eslint.lintFiles(['cycle/a.ts', 'cycle/b.ts']);
	const reported: string[] = [];
	for (const { messages } of results) {
		for (const { ruleId } of messages) if (ruleId !== null) reported.push(ruleId);
	}
	expect(reported).toEqual(['import/no-cycle', 'import/no-cycle']);
});
