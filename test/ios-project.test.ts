import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("iPhone bundle declares the executable required for device installation", async () => {
  const plist = await readFile(new URL("../ios/Configuration/Info.plist", import.meta.url), "utf8");
  assert.match(plist, /<key>CFBundleExecutable<\/key>\s*<string>\$\(EXECUTABLE_NAME\)<\/string>/);
  assert.match(plist, /<key>CFBundlePackageType<\/key>\s*<string>APPL<\/string>/);
});
