"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = path.join(__dirname, "..", "frontend", "assets", "js", "modules", "library.js");
const source = fs.readFileSync(file, "utf8");
function section(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Missing test section: ${start}`);
  return source.slice(first, last);
}
const setup = [
  section("  const DEFAULT_RENAME_TEMPLATE", "  const ISBN_PROVIDERS"),
  section("  const NAME_FIELDS", "  const VIEW_KEY"),
  section("  function cleanField(", "  // Titoli cifrati"),
  section("  function yearOf(", "  // Titolo e autore dal dizionario Info"),
  section("  function nameField(", "  function normKey("),
  "function prefs() { return globalThis.savedPrefs || {}; }",
  "globalThis.libraryNames = { guessFromName, proposal, standardName };",
].join("\n");
const context = {};
vm.runInNewContext(setup, context, { filename: file });
const { guessFromName, proposal, standardName } = context.libraryNames;
const hash = "0123456789abcdef0123456789abcdef";
const archive = `Photo Journal – November 2021 -- Photo Journal -- Photo Journal, 2021 nov -- Photo Journal -- ${hash} -- Anna’s Archive.pdf`;
const guess = guessFromName(archive);
assert.equal(guess.title, "Photo Journal");
assert.equal(guess.author, "");
assert.equal(guess.year, "2021");
assert.equal(guess.month, "11");
assert.equal(standardName(guess, { name: archive }, ["title", "year", "month"], "book"), "Photo Journal - 2021 - 11.pdf");

const unknown = guessFromName(`Photo Journal – November 2021 -- Special Edition -- ${hash} -- Anna’s Archive.pdf`);
assert.equal(unknown.title, "Photo Journal -- Special Edition");
assert.equal(unknown.author, "");
const conflicting = guessFromName(`Photo Journal – November 2021 -- Photo Journal, 2022 nov -- ${hash} -- Anna’s Archive.pdf`);
assert.equal(conflicting.title, "Photo Journal -- Photo Journal, 2022 nov");

const ordinary = guessFromName("La macchina del tempo - Herbert George Wells - 1895.epub");
assert.equal(ordinary.title, "La macchina del tempo");
assert.equal(ordinary.author, "Herbert George Wells");
assert.equal(ordinary.year, "1895");
const reversed = guessFromName("Mario Rossi - La storia delle stelle lontane - 2020.epub");
assert.equal(reversed.title, "La storia delle stelle lontane");
assert.equal(reversed.author, "Mario Rossi");
const doubleDash = guessFromName("Photo Journal -- The complete edition for collectors.pdf");
assert.equal(doubleDash.title, "Photo Journal -- The complete edition for collectors");
assert.equal(doubleDash.author, "");
assert.equal(guessFromName("Spider-Man 2099.pdf").title, "Spider-Man 2099");
assert.equal(guessFromName(`Storia -- ${hash}.pdf`).title, `Storia -- ${hash}`);
assert.equal(guessFromName(`Storia -- ${hash} -- Altro Archivio.pdf`).title, `Storia -- ${hash} -- Altro Archivio`);

const saved = proposal({ name: archive, title: "Titolo corretto", author: "", year: "", month: "", edited: true });
assert.equal(saved.title, "Titolo corretto");
assert.equal(saved.author, "");
assert.equal(saved.year, "");
assert.equal(saved.month, "");
const extracted = proposal({ name: archive, title: "Titolo incorporato", author: "Autore", edited: false });
assert.equal(extracted.title, "Titolo incorporato");
assert.equal(extracted.author, "Autore");

const migrationSetup = [
  section("  const PREFS_KEY", "  const ISBN_PROVIDERS"),
  section("  function migrateMonthFormat(", "  function savePrefs("),
  "let prefsCache = null;",
  "globalThis.readPrefs = prefs;",
].join("\n");
const original = {
  renameTemplate: "{titolo} - {meseNome}",
  renameProfiles: {
    book: { template: "{titolo} - {meseNome}", monthFormat: "name", separator: " / ", order: ["title", "month"], yearFormat: "short", numberFormat: "plain" },
    magazine: { template: "{titolo} - {mese}", monthFormat: "name" },
    comic: { template: "{titolo} - {meseNome}", monthFormat: "name" },
  },
  sort: "title",
};
let stored = JSON.stringify(original);
const storage = {
  getItem: () => stored,
  setItem: (key, value) => { stored = value; },
};
function loadPrefs(localStorage = storage, errorConsole = console) {
  const migrationContext = { localStorage, console: errorConsole };
  vm.runInNewContext(migrationSetup, migrationContext, { filename: file });
  return migrationContext.readPrefs();
}
const migrated = loadPrefs();
const persisted = JSON.parse(stored);
assert.equal(persisted.monthNumberDefaultApplied, true);
assert.equal(persisted.renameTemplate, "{titolo} - {mese}");
assert.equal(persisted.renameProfiles.book.template, "{titolo} - {mese}");
assert.equal(persisted.renameProfiles.comic.template, "{titolo} - {mese}");
assert.equal(persisted.renameProfiles.book.separator, " / ");
assert.equal(persisted.renameProfiles.book.yearFormat, "short");
assert.equal(persisted.sort, "title");
context.savedPrefs = migrated;
for (const profile of ["book", "magazine", "comic"]) {
  assert.equal(persisted.renameProfiles[profile].monthFormat, "number");
  const result = standardName({ title: "Test", month: "novembre" }, { name: "test.pdf" }, ["title", "month"], profile);
  assert.match(result, /11\.pdf$/);
}
persisted.renameProfiles.book.monthFormat = "name";
persisted.renameProfiles.book.template = "{titolo} - {meseNome}";
stored = JSON.stringify(persisted);
const later = loadPrefs();
context.savedPrefs = later;
assert.equal(later.renameProfiles.book.monthFormat, "name");
assert.equal(later.renameProfiles.book.template, "{titolo} - {meseNome}");
assert.match(standardName({ title: "Test", month: "11" }, { name: "test.pdf" }, ["title", "month"], "book"), /Novembre\.pdf$/);
assert.match(standardName({ title: "Test", month: "11" }, { name: "test.pdf" }, undefined, "book"), /Novembre\.pdf$/);
stored = JSON.stringify({});
context.savedPrefs = loadPrefs();
for (const profile of ["book", "magazine", "comic"]) {
  assert.match(standardName({ title: "Test", month: "11" }, { name: "test.pdf" }, ["title", "month"], profile), /11\.pdf$/);
}
let logged = false;
const unavailableStorage = { getItem: () => JSON.stringify(original), setItem: () => { throw Error("storage unavailable"); } };
const fallback = loadPrefs(unavailableStorage, { error: () => { logged = true; } });
assert.equal(logged, true);
assert.equal(fallback.renameProfiles.book.monthFormat, "number");
console.log("PASS library filename proposals, saved edits and month format migration");
