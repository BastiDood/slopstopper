import { OXLINT_RULE_TESTER } from '#testing/oxlint-rule-tester.ts';

import { HANDLE_OR_RETHROW } from './index.ts';

OXLINT_RULE_TESTER.run('handle-or-rethrow', HANDLE_OR_RETHROW, {
	valid: [
		// Narrowing with `instanceof` and rethrowing unexpected errors.
		'function f() { try { g(); } catch (error) { if (!(error instanceof NotFound)) throw error; return fallback; } }',
		// Wrapping with `cause`: a call inside the thrown expression is not recording.
		"try { g(); } catch (error) { throw new AppError('x', { cause: error }); }",
		// Referenced only inside a nested function.
		'try { g(); } catch (error) { setTimeout(() => report(error)); }',
		// A call in a nested function does not count as recording next to a throw.
		'try { g(); } catch (error) { queue.push(() => logger.error(error)); throw error; }',
		// A throw inside a `try` without a `catch` still leaves the clause.
		'try { g(); } catch (error) { try { throw new Error(); } finally { cleanup(); } }',
		// Destructured parameters are never treated as recorded.
		'try { g(); } catch ({ message }) { logger.warn(message); throw new AppError(message); }',
	],
	invalid: [
		// Unbound catch, even when it throws.
		{
			code: 'try { g(); } catch { throw new AppError(); }',
			errors: [{ messageId: 'unboundCatch' }],
		},
		// A throw only inside a nested function does not rethrow.
		{
			code: 'try { g(); } catch (error) { return () => { throw new Error(); }; }',
			errors: [{ messageId: 'swallowed', data: { error: 'error' } }],
		},
		// A throw caught by an inner try does not leave the outer clause.
		{
			code: 'try { g(); } catch (error) { try { throw new Error(); } catch (inner) { logger.warn(inner); } }',
			errors: [{ messageId: 'swallowed' }],
		},
		// Log and rethrow, also with the error forwarded through wrappers such as object literals.
		{
			code: 'try { g(); } catch (error) { logger.error({ error }); throw error; }',
			errors: [
				{
					messageId: 'logAndRethrow',
					data: { call: 'logger.error({ error })', error: 'error' },
				},
			],
		},
		// A throw inside the inner catch body leaves the outer clause too.
		{
			code: 'try { g(); } catch (error) { logger.error(error); try { h(); } catch (inner) { throw inner; } }',
			errors: [{ messageId: 'logAndRethrow' }],
		},
	],
});
