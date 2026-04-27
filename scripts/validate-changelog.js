#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const changelogPath = path.resolve(__dirname, "..", "CHANGELOG.md");
const changelog = fs.readFileSync(changelogPath, "utf8");
const lines = changelog.split(/\r?\n/);
const errors = [];

if (lines[0] !== "# Changelog") {
  errors.push("CHANGELOG.md must start with '# Changelog'.");
}

const versionHeadingRegex =
  /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]\(https:\/\/github\.com\/gatanasi\/video-converter\/compare\/v[^)]+\) \(\d{4}-\d{2}-\d{2}\)$/;
const malformedVersionHeadingRegex = /^#{1,6} \[?\d+\.\d+\.\d+/;
const headings = [];

lines.forEach((line, index) => {
  const match = line.match(versionHeadingRegex);
  if (match) {
    headings.push({ version: match[1], lineNumber: index + 1 });
    return;
  }

  if (malformedVersionHeadingRegex.test(line)) {
    errors.push(
      `Line ${index + 1}: release heading must use '## [x.y.z](compare-url) (YYYY-MM-DD)'.`,
    );
  }

  const multipleReleaseHeadings = line.match(/## \[\d+\.\d+\.\d+/g);
  if (multipleReleaseHeadings && multipleReleaseHeadings.length > 1) {
    errors.push(`Line ${index + 1}: multiple release headings found on one line.`);
  }
});

if (headings.length === 0) {
  errors.push("CHANGELOG.md must contain at least one release heading.");
}

function parseVersion(version) {
  const [core, prerelease = ""] = version.split("-", 2);
  const [major, minor, patch] = core.split(".").map((part) => Number(part));
  return { major, minor, patch, prerelease };
}

function compareVersionsDesc(leftVersion, rightVersion) {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);

  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return right[key] - left[key];
    }
  }

  if (left.prerelease === right.prerelease) {
    return 0;
  }
  if (!left.prerelease) {
    return -1;
  }
  if (!right.prerelease) {
    return 1;
  }
  return left.prerelease < right.prerelease ? 1 : -1;
}

for (let index = 1; index < headings.length; index += 1) {
  const previous = headings[index - 1];
  const current = headings[index];
  if (compareVersionsDesc(previous.version, current.version) > 0) {
    errors.push(
      `Line ${current.lineNumber}: version ${current.version} must appear before ${previous.version}.`,
    );
  }
}

if (errors.length > 0) {
  console.error("Invalid changelog:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`CHANGELOG.md is valid (${headings.length} releases checked).`);
