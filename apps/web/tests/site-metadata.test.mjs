import { test } from "node:test";
import assert from "node:assert/strict";
import { createDevspaceMetadata } from "../helpers/site-metadata.ts";

test("social metadata uses absolute public-origin links for production and self-hosted installs", () => {
  for (const origin of ["https://devspace.mergesoft.cloud", "http://localhost:8089", "https://team.example.test"]) {
    const meta = createDevspaceMetadata(origin + "/");
    const property = (name) => meta.find((item) => item.property === name)?.content;
    const named = (name) => meta.find((item) => item.name === name)?.content;
    assert.equal(property("og:url"), origin + "/");
    assert.equal(property("og:image"), origin + "/devspace-og-v1.png");
    assert.equal(named("twitter:image"), property("og:image"));
    assert.equal(property("og:image:width"), "1200");
    assert.equal(property("og:image:height"), "630");
    assert.equal(property("og:site_name"), "Devspace");
    assert.ok(meta.find((item) => item.title)?.title.startsWith("Devspace"));
    assert.ok(!JSON.stringify(meta).includes("app.plane.so"));
    assert.ok(!meta.some((item) => item.name === "twitter:site"));
  }
});
