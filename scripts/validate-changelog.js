#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const defaultChangelogPath = path.resolve(__dirname, "..", "CHANGELOG.md");

const releaseVersionPattern = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?`;
const versionHeadingRegex = new RegExp(
  String.raw`^## \[(${releaseVersionPattern})\]\(https?:\/\/[^)\s]+\/compare\/v[^)\s]+\) \(\d{4}-\d{2}-\d{2}\)$`,
);
const releaseHeadingMarkerRegex = new RegExp(String.raw`## \[${releaseVersionPattern}\]`, "g");
const malformedVersionHeadingRegex = /^#{1,6} \[?\d+\.\d+\.\d+/;
const numericIdentifierRegex = /^(0|[1-9]\d*)$/;
const leadingZeroNumericIdentifierRegex = /^0\d+$/;

function parseVersion(version) {
  const prereleaseSeparatorIndex = version.indexOf("-");
  const core =
    prereleaseSeparatorIndex === -1
      ? version
      : version.slice(0, prereleaseSeparatorIndex);
  const prerelease =
    prereleaseSeparatorIndex === -1 ? "" : version.slice(prereleaseSeparatorIndex + 1);
  const [major, minor, patch] = core.split(".").map((part) => Number(part));
  const prereleaseIdentifiers = prerelease === "" ? [] : prerelease.split(".");
  return { major, minor, patch, prerelease, prereleaseIdentifiers };
}

function comparePrereleaseAsc(leftIdentifiers, rightIdentifiers) {
  const length = Math.max(leftIdentifiers.length, rightIdentifiers.length);

  for (let index = 0; index < length; index += 1) {
    const left = leftIdentifiers[index];
    const right = rightIdentifiers[index];

    if (left === undefined) {
      return -1;
    }
    if (right === undefined) {
      return 1;
    }
    if (left === right) {
      continue;
    }

    const leftIsNumeric = numericIdentifierRegex.test(left);
    const rightIsNumeric = numericIdentifierRegex.test(right);

    if (leftIsNumeric && rightIsNumeric) {
      const leftNumber = BigInt(left);
      const rightNumber = BigInt(right);
      if (leftNumber === rightNumber) {
        continue;
      }
      return leftNumber < rightNumber ? -1 : 1;
    }
    if (leftIsNumeric) {
      return -1;
    }
    if (rightIsNumeric) {
      return 1;
    }

    return left < right ? -1 : 1;
  }

  return 0;
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
  return -comparePrereleaseAsc(left.prereleaseIdentifiers, right.prereleaseIdentifiers);
}

function invalidPrereleaseIdentifiers(version) {
  return parseVersion(version).prereleaseIdentifiers.filter((identifier) =>
    leadingZeroNumericIdentifierRegex.test(identifier),
  );
}

function validateChangelog(changelog) {
  const lines = changelog.split(/\r?\n/);
  const errors = [];
  const headings = [];

  if (lines[0] !== "# Changelog") {
    errors.push("CHANGELOG.md must start with '# Changelog'.");
  }

  lines.forEach((line, index) => {
    const match = line.match(versionHeadingRegex);
    if (match) {
      const version = match[1];
      headings.push({ version, lineNumber: index + 1 });

      for (const identifier of invalidPrereleaseIdentifiers(version)) {
        errors.push(
          `Line ${index + 1}: numeric prerelease identifier '${identifier}' must not include leading zeros in version ${version}.`,
        );
      }
      return;
    }

    if (malformedVersionHeadingRegex.test(line)) {
      errors.push(
        `Line ${index + 1}: release heading must use '## [x.y.z](compare-url) (YYYY-MM-DD)'.`,
      );
    }

    const multipleReleaseHeadings = line.match(releaseHeadingMarkerRegex);
    if (multipleReleaseHeadings && multipleReleaseHeadings.length > 1) {
      errors.push(`Line ${index + 1}: multiple release headings found on one line.`);
    }
  });

  if (headings.length === 0) {
    errors.push("CHANGELOG.md must contain at least one release heading.");
  }

  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1];
    const current = headings[index];
    const comparison = compareVersionsDesc(previous.version, current.version);
    if (comparison > 0) {
      errors.push(
        `Line ${current.lineNumber}: version ${current.version} must appear before ${previous.version}.`,
      );
    } else if (comparison === 0) {
      errors.push(
        `Line ${current.lineNumber}: duplicate version ${current.version} found (also on line ${previous.lineNumber}).`,
      );
    }
  }

  return { errors, headings };
}

function main() {
  const changelog = fs.readFileSync(defaultChangelogPath, "utf8");
  const { errors, headings } = validateChangelog(changelog);

  if (errors.length > 0) {
    console.error("Invalid changelog:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`CHANGELOG.md is valid (${headings.length} releases checked).`);
}

if (require.main === module) {
  main();
}

module.exports = {
  compareVersionsDesc,
  parseVersion,
  validateChangelog,
};
