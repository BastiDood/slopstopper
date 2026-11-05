/**
 * Matches a `<script>` of a Svelte component in the AST of `svelte-eslint-parser`. Only ESLint with
 * `svelte-eslint-parser` produces `SvelteScriptElement` nodes, so in Oxlint the selector matches nothing.
 */
export const SVELTE_SCRIPT_SELECTOR = 'SvelteScriptElement';

/**
 * Matches the attribute that marks a Svelte `<script>` as the module script: `module`, or the legacy `context="module"`.
 * `svelte-eslint-parser` visits the attributes of a `<script>` before its body.
 */
export const SVELTE_MODULE_ATTRIBUTE_SELECTOR =
	'SvelteScriptElement > SvelteStartTag > SvelteAttribute:matches([key.name="module"], [key.name="context"][value.0.value="module"])';

/** Whether a file is a Svelte component, which `svelte-eslint-parser` parses into Svelte nodes around the scripts. */
export function isSvelteComponent(filename: string) {
	return filename.endsWith('.svelte');
}
