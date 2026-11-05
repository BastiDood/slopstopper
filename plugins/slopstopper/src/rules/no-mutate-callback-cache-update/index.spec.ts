import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_MUTATE_CALLBACK_CACHE_UPDATE } from './index.ts';

const REACT_IMPORT = "import { useMutation } from '@tanstack/react-query';";

const ERROR = { messageId: 'cacheUpdate' };

OXLINT_RULE_TESTER.run('no-mutate-callback-cache-update', NO_MUTATE_CALLBACK_CACHE_UPDATE, {
	valid: [
		// A renamed field of an untraced call, and a computed member.
		'const { mutate: save } = useCustom(); save(input, { onSuccess: () => queryClient.invalidateQueries() }); mutation[method](input, { onSuccess: () => queryClient.invalidateQueries() });',
	],
	invalid: [
		// A `.mutate` member call, nested deep in a callback.
		{
			code: 'mutation.mutate(input, { onSettled() { if (ok) { void queryClient.invalidateQueries({ queryKey }); } } });',
			errors: [ERROR],
		},
	],
});

UNTYPED_RULE_TESTER.run(
	'no-mutate-callback-cache-update',
	eslintRule(NO_MUTATE_CALLBACK_CACHE_UPDATE),
	{
		valid: [
			// A cache update in the callbacks of the mutation definition.
			`${REACT_IMPORT} const { mutate } = useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey }) });`,
		],
		invalid: [
			// Renamed destructuring of an aliased import.
			{
				code: "import { useMutation as useM } from '@tanstack/react-query'; const { mutate: save } = useM(options); save(input, { onSuccess: () => queryClient.invalidateQueries() });",
				errors: [ERROR],
			},
		],
	},
);

SVELTE_RULE_TESTER.run(
	'no-mutate-callback-cache-update',
	eslintRule(NO_MUTATE_CALLBACK_CACHE_UPDATE),
	{
		valid: [],
		invalid: [
			{
				filename: 'Form.svelte',
				code: `<script lang="ts">
	import { createMutation } from '@tanstack/svelte-query';
	const mutation = createMutation(() => options);
</script>
<button onclick={() => mutation.mutate(input, { onSuccess: () => queryClient.invalidateQueries({ queryKey }) })}>Save</button>`,
				errors: [ERROR],
			},
		],
	},
);
