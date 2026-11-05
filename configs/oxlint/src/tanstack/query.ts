import type { Entry } from '#compose/index.ts';

/** TanStack Query rules that apply to every framework adapter. */
export const TANSTACK_QUERY = {
	config: { rules: {} },
	restrictions: {},
} satisfies Entry;
