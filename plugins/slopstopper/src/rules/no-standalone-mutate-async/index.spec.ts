import {
	eslintRule,
	SVELTE_RULE_TESTER,
	UNTYPED_RULE_TESTER,
} from '#testing/eslint-rule-tester.ts';
import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_STANDALONE_MUTATE_ASYNC } from './index.ts';

const REACT_IMPORT = "import { useMutation } from '@tanstack/react-query';";

const ERROR = { messageId: 'standalone' };

OXLINT_RULE_TESTER.run('no-standalone-mutate-async', NO_STANDALONE_MUTATE_ASYNC, {
	valid: [
		// Concurrent mutations: elements of an array literal, the return of a `map` callback, or the callback itself.
		`${REACT_IMPORT} const mutation = useMutation(options); await Promise.allSettled([mutation.mutateAsync(a), mutation.mutateAsync(b)]);`,
		`${REACT_IMPORT} const { mutateAsync: save } = useMutation(options); await Promise.race(items.map(item => save(item)));`,
		`${REACT_IMPORT} const { mutateAsync } = useMutation(options); await Promise.any(items.map(function (item) { return mutateAsync(item); }));`,
		`${REACT_IMPORT} const { mutateAsync } = useMutation(options); await Promise.all(items.map(mutateAsync));`,
		// Neither a type query nor an assignment target is a use.
		`${REACT_IMPORT} const mutation = useMutation(options); type Save = typeof mutateAsync; mutation.mutateAsync = wrapped;`,
		// Renamed fields that the rule cannot trace to a mutation result.
		`${REACT_IMPORT}
let reassigned = useMutation(options);
reassigned = other;
const [first] = useMutation(options);
const { result: { mutateAsync: second } } = useMutation(options);
const { mutateAsync: third } = reassigned;
const { mutateAsync: fourth } = hooks.mutation;
const { mutateAsync: fifth } = Query.useMutation(options);
first(); second(); third(); fourth(); fifth();`,
		// A local `useMutation` is no TanStack Query import.
		'function useMutation(options) { return options; } const { mutateAsync: run } = useMutation(options); run(input);',
	],
	invalid: [
		// A renamed field of a `const` alias of the result, through another `const` alias.
		{
			code: `${REACT_IMPORT} const mutation = useMutation(options); const { mutateAsync: save } = mutation; const run = save; run(input);`,
			errors: [ERROR],
		},
		// A renamed field with a default value, from a string-literal import name.
		{
			code: "import { 'useMutation' as useM } from '@tanstack/react-query'; const { mutate = noop, mutateAsync: run = fallback } = useM(options); run(input);",
			errors: [ERROR],
		},
		// TypeScript assertions around the reference.
		{
			code: `${REACT_IMPORT} const { mutateAsync } = useMutation(options); (mutateAsync as Save)(a); mutateAsync!(b); submit(mutateAsync satisfies Save); submit(<Save>mutateAsync);`,
			errors: [ERROR, ERROR, ERROR, ERROR],
		},
		// The array literal is not the argument of a `Promise` combinator.
		{
			code: `${REACT_IMPORT} const { mutateAsync } = useMutation(options); const all = [mutateAsync(a)]; submit([mutateAsync(b)]); await Promise.resolve([mutateAsync(c)]);`,
			errors: [ERROR, ERROR, ERROR],
		},
	],
});

UNTYPED_RULE_TESTER.run('no-standalone-mutate-async', eslintRule(NO_STANDALONE_MUTATE_ASYNC), {
	valid: [
		`${REACT_IMPORT} const { mutateAsync } = useMutation(options); await Promise.all([mutateAsync(a), mutateAsync(b)]);`,
	],
	invalid: [],
});

SVELTE_RULE_TESTER.run('no-standalone-mutate-async', eslintRule(NO_STANDALONE_MUTATE_ASYNC), {
	valid: [],
	invalid: [
		{
			filename: 'Form.svelte',
			code: `<script lang="ts">
	import { createMutation } from '@tanstack/svelte-query';
	const mutation = createMutation(() => options);
	async function save() {
		await mutation.mutateAsync(input);
	}
</script>
<button onclick={() => mutation.mutateAsync(input)}>Save</button>`,
			errors: [ERROR, ERROR],
		},
	],
});
