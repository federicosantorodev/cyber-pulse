"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  const calls = [];
  let response = { ok: true, data: {} };
  const window = { CYBER_PULSE_CONFIG: { backendUrl: "https://example.test/api" } };
  const context = {
    window, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return { ok: true, json: async () => response };
    },
  };
  const file = path.join(__dirname, "..", "frontend", "assets", "js", "api.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  const api = window.CyberPulseApi;
  assert.equal(typeof api.fetchSbnIsbn, "function");
  assert.equal(typeof api.fetchMusic, "function");
  assert.equal(api.isConfigured(), true);

  response = { ok: true, data: { editions: [{ title: "Test", author: "Autore", publisher: "Editore", year: "2025" }] } };
  const editions = await api.fetchSbnIsbn("9788842925828");
  assert.equal(editions[0].title, "Test");
  assert.equal(new URL(calls.at(-1).url).searchParams.get("action"), "sbn-isbn");
  assert.equal(new URL(calls.at(-1).url).searchParams.get("isbn"), "9788842925828");

  response = { ok: true, data: { editions: [{ title: "Test" }] } };
  await assert.rejects(api.fetchSbnIsbn("9788842925828"), (error) => error.code === "BAD_RESPONSE");

  response = { ok: true, data: { front: { stories: [], headlines: [] } } };
  const music = await api.fetchMusic({ kind: "dashboard" });
  assert.equal(music.front.stories.length, 0);
  assert.equal(new URL(calls.at(-1).url).searchParams.get("action"), "music");
  console.log("PASS API initialization, SBN and music");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
