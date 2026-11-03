import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { NO_TEMPORARY_ACCESS } from './index.ts';

OXLINT_RULE_TESTER.run('no-temporary-access', NO_TEMPORARY_ACCESS, {
	valid: [
		// A method call reads no field.
		'f().g();',
		// Neither does a tagged template, which calls the member as a method.
		'f().raw`x`;',
		// A field read that receives a method call is allowed.
		'expect(x).not.toThrow();',
	],
	invalid: [
		// A lone `const` declarator destructures the result in place.
		{
			code: 'const y = f().y;',
			output: 'const { y } = f();',
			errors: bind('f()'),
		},
		// The declarator keeps its own name.
		{
			code: 'const x = f().y;',
			output: 'const { y: x } = f();',
			errors: bind('f()'),
		},
		// A `for…of` iterable gets the destructuring on its own line before the loop.
		{
			code: 'function g(thing: Thing) {\n\tfor (const ref of thing.references().reference) use(ref);\n}',
			output: 'function g(thing: Thing) {\n\tconst { reference } = thing.references();\n\tfor (const ref of reference) use(ref);\n}',
			errors: bind('thing.references()'),
		},
		// So does a `return` argument, ...
		{
			code: 'function g() {\n\treturn f().y;\n}',
			output: 'function g() {\n\tconst { y } = f();\n\treturn y;\n}',
			errors: bind('f()'),
		},
		// ... a `throw` argument, ...
		{
			code: 'function g() {\n\tthrow f().reason;\n}',
			output: 'function g() {\n\tconst { reason } = f();\n\tthrow reason;\n}',
			errors: bind('f()'),
		},
		// ... and an `if` test.
		{
			code: 'if (f().ready) go();',
			output: 'const { ready } = f();\nif (ready) go();',
			errors: bind('f()'),
		},
		// Two fixes never declare one name in one scope, so the second waits for the next pass to see the first.
		{
			code: 'if (f().ready) go();\nif (g().ready) stop();',
			output: 'const { ready } = f();\nif (ready) go();\nif (g().ready) stop();',
			errors: [...bind('f()'), ...bind('g()')],
		},
		// A loop condition runs the call on every iteration.
		{
			code: 'while (queue.shift().next) step();',
			errors: [{ messageId: 'bindInLoop', data: { call: 'queue.shift()' } }],
		},
		// The right side of `&&` runs the call only sometimes.
		{
			code: 'const y = a && f().y;',
			errors: [{ messageId: 'bindInBranch', data: { call: 'f()' } }],
		},
		// So does the right side of a logical assignment.
		{
			code: 'cache.y ??= f().y;',
			errors: [{ messageId: 'bindInBranch', data: { call: 'f()' } }],
		},
		// An arrow expression body has no statement to bind in, and a long call text is cut in the message.
		{
			code: 'const get = () => compute(alpha, beta,\n\tgamma, delta, epsilon).y;',
			errors: [
				{
					messageId: 'bindInArrowBody',
					data: { call: 'compute(alpha, beta, gamma, delta, epsi…' },
				},
			],
		},
		// An optional read needs an `undefined` check after binding.
		{
			code: 'const y = f()?.y;',
			errors: [{ messageId: 'bindOptionalResult', data: { call: 'f()' } }],
		},
		// A computed key has no name to bind.
		{
			code: 'const first = f()[0];',
			errors: bind('f()'),
		},
		// Neither does a private name.
		{
			code: 'class K {\n\t#x = 1;\n\tm() {\n\t\treturn make().#x;\n\t}\n}',
			errors: bind('make()'),
		},
		// A shorthand destructuring cannot bind a reserved word.
		{
			code: 'function g() {\n\treturn f().default;\n}',
			errors: bind('f()'),
		},
		// A `let` declaration can be reassigned, so it stays as it is.
		{
			code: 'let y = f().y;',
			errors: bind('f()'),
		},
		// An `else if` test has no statement list to declare in.
		{
			code: 'if (a) x();\nelse if (f().ready) go();',
			errors: bind('f()'),
		},
		// The loop variable shadows the name inside the loop head.
		{
			code: 'function g(thing: Thing) {\n\tfor (const reference of thing.references().reference) use(reference);\n}',
			errors: bind('thing.references()'),
		},
		// The rewrite would drop the comment between the call and the field.
		{
			code: 'function g() {\n\treturn f() /* why */.y;\n}',
			errors: bind('f()'),
		},
	],
});

function bind(call: string) {
	return [{ messageId: 'bindResult', data: { call } }];
}
