# Development quality gate

- Use the installed `superpowers:test-driven-development` skill for behavior changes: create or update focused tests before implementing the change.
- Use `superpowers:verification-before-completion` before reporting a development task complete.
- The required verification command is `npm run check && npm test`. Fix failures before declaring completion.
- Report the exact verification result; never claim tests passed unless the command ran successfully in the current work.
