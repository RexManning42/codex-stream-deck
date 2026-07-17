import assert from "node:assert/strict";
import test from "node:test";
import { codexThreadUrl } from "../src/windows-open.js";

test("Codex task deep links only accept task UUIDs or new", () => {
  assert.equal(codexThreadUrl("019f6c28-3135-7d82-ae2d-88288501c2ba"), "codex://threads/019f6c28-3135-7d82-ae2d-88288501c2ba");
  assert.equal(codexThreadUrl("new"), "codex://threads/new");
  assert.throws(() => codexThreadUrl("'; Remove-Item C:\\"), /Ungültige Codex-Task-ID/);
});
