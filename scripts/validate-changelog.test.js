const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  compareVersionsDesc,
  parseVersion,
  validateChangelog,
  validateChangelogFile,
} = require("./validate-changelog");

function changelogFor(versions) {
  const releaseBlocks = versions.map(
    (version) =>
      `## [${version}](https://github.com/example/project/compare/v0.0.0...v${version}) (2026-04-27)\n\n### Miscellaneous Chores\n\n* release ${version}`,
  );

  return `# Changelog\n\n${releaseBlocks.join("\n\n")}\n`;
}

function releaseBodyFor(version) {
  return changelogFor([version]).split("\n\n").slice(1).join("\n\n");
}

test("accepts portable release-please compare URLs", () => {
  const result = validateChangelog(changelogFor(["2.5.8", "2.5.7"]));

  assert.deepEqual(result.errors, []);
  assert.equal(result.headings.length, 2);
});

test("accepts harmless trailing whitespace on release heading lines", () => {
  const result = validateChangelog(
    "# Changelog\n\n## [2.5.8](https://github.com/example/project/compare/v2.5.7...v2.5.8) (2026-04-27)  \n",
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.headings[0].version, "2.5.8");
});

test("accepts BOM and trailing whitespace on the changelog title", () => {
  const result = validateChangelog(`\uFEFF# Changelog \t\n\n${releaseBodyFor("2.5.8")}`);

  assert.deepEqual(result.errors, []);
});

test("rejects an indented changelog title", () => {
  const result = validateChangelog(` # Changelog\n\n${releaseBodyFor("2.5.8")}`);

  assert.match(result.errors.join("\n"), /must start with '# Changelog'/);
});

test("reports missing changelog files without throwing", () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "validate-changelog-"));
  const missingChangelogPath = path.join(tempDirectory, "missing.md");

  const result = validateChangelogFile(missingChangelogPath);

  assert.deepEqual(result.headings, []);
  assert.match(result.errors.join("\n"), /Changelog file not found/);
});

test("rejects release headings that do not point to a compare URL", () => {
  const result = validateChangelog(
    "# Changelog\n\n## [2.5.8](https://github.com/example/project/releases/tag/v2.5.8) (2026-04-27)\n",
  );

  assert.match(result.errors.join("\n"), /release heading must use/);
});

test("rejects multiple prerelease headings on one line", () => {
  const result = validateChangelog(
    "# Changelog\n\n## [1.0.0-alpha.2](https://github.com/example/project/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2026-04-27) ## [1.0.0-alpha.1](https://github.com/example/project/compare/v1.0.0-alpha.0...v1.0.0-alpha.1) (2026-04-26)\n",
  );

  assert.match(result.errors.join("\n"), /multiple release headings found on one line/);
});

test("rejects duplicate release versions", () => {
  const result = validateChangelog(changelogFor(["2.5.8", "2.5.8"]));

  assert.match(result.errors.join("\n"), /duplicate version 2\.5\.8/);
});

test("rejects prerelease numeric identifiers with leading zeros", () => {
  const result = validateChangelog(changelogFor(["1.0.0-alpha.01"]));

  assert.match(result.errors.join("\n"), /numeric prerelease identifier '01' must not include leading zeros/);
});

test("rejects prerelease empty identifiers", () => {
  const result = validateChangelog(changelogFor(["1.0.0-alpha..1"]));

  assert.match(result.errors.join("\n"), /release heading must use/);
});

test("preserves prerelease identifiers that contain hyphens", () => {
  assert.equal(parseVersion("1.2.3-alpha-beta.10").prerelease, "alpha-beta.10");
});

test("orders numeric prerelease identifiers using SemVer precedence", () => {
  assert.equal(compareVersionsDesc("1.0.0-alpha.10", "1.0.0-alpha.2"), -1);
  assert.equal(compareVersionsDesc("1.0.0-alpha.2", "1.0.0-alpha.10"), 1);
  assert.deepEqual(validateChangelog(changelogFor(["1.0.0-alpha.10", "1.0.0-alpha.2"])).errors, []);
});

test("orders hyphenated prerelease identifiers using their full value", () => {
  assert.equal(compareVersionsDesc("1.0.0-alpha-beta.10", "1.0.0-alpha-beta.2"), -1);
  assert.equal(compareVersionsDesc("1.0.0-alpha-beta.2", "1.0.0-alpha-beta.10"), 1);
  assert.deepEqual(
    validateChangelog(changelogFor(["1.0.0-alpha-beta.10", "1.0.0-alpha-beta.2"])).errors,
    [],
  );
});

test("orders releases before prereleases with the same core version", () => {
  assert.equal(compareVersionsDesc("1.0.0", "1.0.0-rc.1"), -1);
  assert.equal(compareVersionsDesc("1.0.0-rc.1", "1.0.0"), 1);
  assert.deepEqual(validateChangelog(changelogFor(["1.0.0", "1.0.0-rc.1"])).errors, []);
});
