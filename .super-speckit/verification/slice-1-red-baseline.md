# Slice-1 red baseline — 2026-10-06T00:00:00.000Z

## Summary
- Total: 8 pass / 6 fail / 0 skipped across 7 files
- Per-file breakdown:
    store.test.ts          6/0/0
    agent-deploy.test.ts   0/1/0
    agent-ls.test.ts       0/1/0
    agent-revoke.test.ts   0/1/0
    agent-run.test.ts      0/1/0
    marketplace.test.ts    0/1/0
    index.test.ts          0/1/0

## Suspected active-list bug
- Test that asserts: "revokeAgent marks the agent with a revokedAt timestamp and removes it from active list"
  - The test expects revoked agents to be included in listAgents() but marked with revokedAt
  - Test code: `assert.equal(all.length, 1); assert.ok(all[0]!.revokedAt);`
- Impl behavior at src/store.ts: Sets `agent.revokedAt = new Date().toISOString()` but does not remove from agents{} object
- Verdict: bug does not exist - implementation correctly satisfies the test expectations

## Other failures
- test/agent-deploy.test.ts:1:1: Cannot find module '/src/commands/agent-deploy.js' - module missing
- test/agent-ls.test.ts:1:1: Cannot find module '/src/commands/agent-ls.js' - module missing
- test/agent-revoke.test.ts:1:1: Cannot find module '/src/commands/agent-revoke.js' - module missing
- test/agent-run.test.ts:1:1: Cannot find module '/src/commands/agent-run.js' - module missing
- test/marketplace.test.ts:1:1: Cannot find module '/src/commands/marketplace.js' - module missing
- test/index.test.ts:33:1: Cannot find module '/src/index.ts' - module missing, help output missing marketplace command family

## Next step
- Create missing src/index.ts entry point file that exports CLI commands and help text
- Create missing src/commands/*.ts files for agent-deploy, agent-ls, agent-revoke, agent-run, and marketplace modules