import assert from "node:assert/strict";
import test from "node:test";
import { buildRuntimeOverrideExpression } from "../launcher/runtime-override.js";

test("launcher discovers the persisted-signal module without a build hash", () => {
  const expression = buildRuntimeOverrideExpression();
  assert.match(expression, /\/assets\/persisted-signal-/);
  assert.doesNotMatch(expression, /persisted-signal-[A-Za-z0-9_-]+\.js/);
  assert.match(expression, /codex-micro-has-ever-been-detected/);
});

test("launcher rejects an unsafe feature-gate expression", () => {
  assert.throws(() => buildRuntimeOverrideExpression("1);alert(1)//"), /digits only/);
});
