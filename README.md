# The Slop Stopper

I'm tired of reading and reviewing AI slop code. (Yes, I still review the output.)

I strongly believe that the solution to this problem is not to eliminate code reviews altogether (as some would proudly preach), but to constrain coding agents within stricter verification loops and prescribed code styles. The more guardrails we can put around LLM outputs, the saner we can be during code reviews.

- Less bickering and nitpicking.
- Less review cycles on refactoring.
- More attention towards the critical implementation details that matter.

Introducing the **Slop Stopper**: a collection of highly opinionated plugins + configurations for Oxlint/ESLint, Oxfmt, and TypeScript. By "highly opinionated", I mean that literally: there is almost zero configuration exposed except for project-specific allowances (e.g., file paths).

To be absolutely clear: configuration is an explicit _non-goal_ of this project. I want to impose my conventions and constraints. It's _my_ way or the highway. (You don't even read the code anyway, right?)

However, an explicit goal of this project is to see how far I can push static analysis with linters, formatters, and type checkers so that they either (1) auto-fix violations immediately or (2) reliably flag violations with concrete refactor suggestions for coding agents. Suggestions can range from nitpick fixes to large-scale rethinking of architectures/compositions.

This methodology is very much inspired by my foray into building MCP servers, where everything returned to an LLM can be used as signal to steer it in the right direction. Even something as simple as error messages with concrete suggestions go a long way. That's what I intend to emulate here with linter messages.

## Installation

To get started, refer to the respective installation guides for each plugin/configuration:

- See the [base Oxlint configuration](./configs/oxlint/README.md) with (optional) experimental support for Svelte and Astro.
- See the [base ESLint configuration](./configs/eslint/README.md).
  - See the optional [Svelte extension](./configs/eslint-svelte/README.md).
  - See the optional [Astro extension](./configs/eslint-astro/README.md).
- See the [Oxfmt configuration](./configs/oxfmt/README.md).
- See the [base TypeScript configuration](./configs/tsconfig/README.md).

## License

This project is licensed under the [MIT](./LICENSE) license.
