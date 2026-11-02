import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const dimensions = (file) => {
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};

test("Web and Admin manifests resolve Devspace icons with real matching PNG dimensions", () => {
  for (const app of ["web", "admin"]) {
    const base = app === "admin" ? "/god-mode/" : "/";
    const publicDir = path.join(repo, app, "public");
    const manifest = JSON.parse(readFileSync(path.join(publicDir, "site.webmanifest.json"), "utf8"));
    assert.equal(manifest.short_name, "Devspace");
    assert.equal(manifest.start_url, base);
    for (const icon of manifest.icons) {
      assert.ok(icon.src.startsWith(base + "brand/devspace-"));
      assert.equal(dimensions(path.join(publicDir, icon.src.slice(base.length))).join("x"), icon.sizes);
    }
    for (const size of [16, 32, 48, 180]) {
      assert.deepEqual(dimensions(path.join(publicDir, `brand/devspace-icon-v1-${size}.png`)), [size, size]);
    }
  }
});

test("ICO favicon has valid embedded PNG frames and the same assets ship to both apps", () => {
  const bytes = readFileSync(path.join(repo, "web/public/brand/devspace-favicon-v1.ico"));
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  assert.equal(bytes.readUInt16LE(4), 4);
  for (let i = 0; i < 4; i++) {
    const p = 6 + 16 * i;
    const width = bytes[p] || 256;
    const length = bytes.readUInt32LE(p + 8);
    const offset = bytes.readUInt32LE(p + 12);
    const frame = bytes.subarray(offset, offset + length);
    assert.equal(frame.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(frame.readUInt32BE(16), width);
    assert.equal(frame.readUInt32BE(20), width);
    assert.ok(offset + length <= bytes.length);
  }
  assert.deepEqual(readFileSync(path.join(repo, "admin/public/brand/devspace-favicon-v1.ico")), bytes);
});
