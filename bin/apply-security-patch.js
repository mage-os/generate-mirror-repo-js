/**
 * Run with
 *
 * node bin/apply-security-patch.js --repoDir=/path/to/mageos-magento2 \
 *   --patch=249-2026-08-001-CE.patch --branches=main,release/3.x --label=apsb26-92
 *
 * Translates an Adobe isolated security patch to source tree paths and applies
 * it to each supported line, leaving one local branch per line for review.
 *
 * The patch itself is never written into the repository. Adobe's patch files are
 * proprietary; the resulting change to Mage-OS's own source is not. Only the
 * latter is committed.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {execFileSync} = require('child_process');
const parseOptions = require('parse-options');
const {buildPackageMap, buildSourceRoots, translatePatch} = require('../src/patch-translate');

const options = parseOptions(
  `$repoDir $patch $branches $label $direction $gitRepoDir @partial @force @help|h`,
  process.argv
);

if (options.help || !options.repoDir || !options.patch || !options.branches) {
  console.log(`Apply an Adobe isolated security patch across Mage-OS release lines.

Usage:
  node bin/apply-security-patch.js [OPTIONS]

Options:
  --repoDir=   Path to a mageos-magento2 checkout (required)
  --gitRepoDir= Dir holding several checkouts, to map packages that live in
               their own repositories (inventory, page builder, security)
  --patch=     Adobe patch file, or - for STDIN (required)
  --branches=  Comma separated target branches (required), e.g. main,release/3.x
  --label=     Short name used for the created branches (default: security-patch)
  --direction= to-source (default) or none, to skip translation
  --partial    Apply what applies and leave .rej files for the rest, instead of
               rolling the whole patch back when one file conflicts
  --force      Replace an existing <label>-<branch>, discarding what is on it

Creates and commits one branch per target, named <label>-<branch>, and returns
the repository to the ref it started on. A conflicted result is committed to its
branch with the markers in place, because that is the material a reviewer needs
and because anything left in the working tree blocks the next checkout. Rejected
hunks stay as untracked .rej files next to the file they belong to.

Exits non-zero if any target needs a person: ERROR, UNMAPPED, REJECTED,
CONFLICT or PARTIAL.
`);
  process.exit(1);
}

// Validated here because translatePatch's own check is never reached with the
// user's value: anything but "none" used to fall through to to-source silently.
const direction = options.direction || 'to-source';
if (direction !== 'to-source' && direction !== 'none') {
  console.error(`Unknown --direction "${direction}", expected to-source or none`);
  process.exit(1);
}

const repoDir = options.repoDir;
const label = options.label || 'security-patch';
const targets = options.branches.split(',').map(s => s.trim()).filter(Boolean);

const git = (args, {cwd = repoDir, allowFailure = false} = {}) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 256,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (exception) {
    if (allowFailure) return null;
    throw exception;
  }
};

const patchText = options.patch === '-'
  ? fs.readFileSync(0, 'utf8')
  : fs.readFileSync(options.patch, 'utf8');

const branchName = (target) => `${label}-${target.replace(/[^A-Za-z0-9._-]/g, '-')}`;

const listRejects = () => (git(['ls-files', '--others', '--exclude-standard'], {allowFailure: true}) || '')
  .split('\n').filter(file => file.endsWith('.rej'));

// Untracked .rej files are this tool's own output from an earlier run, and a
// reviewer is meant to still have them, so they do not count as a dirty tree.
const trackedChanges = (git(['status', '--porcelain'], {allowFailure: true}) || '')
  .split('\n').filter(Boolean).filter(line => !line.endsWith('.rej'));

if (trackedChanges.length) {
  console.error(`${repoDir} has uncommitted changes. Applying a patch on top of them would`);
  console.error('mix them into the result branches. Commit or stash them first:');
  trackedChanges.forEach(line => console.error(`  ${line}`));
  process.exit(1);
}

const results = [];
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mageos-patch-'));

// Restored at the end: the tool checks out a branch per target, and leaving the
// repository on the last one makes a second run fail to check anything out.
const startingRef = (git(['symbolic-ref', '--quiet', '--short', 'HEAD'], {allowFailure: true})
  || git(['rev-parse', 'HEAD'], {allowFailure: true}) || '').trim();

for (const target of targets) {
  // The mapping is rebuilt per branch: a module can be added or renamed between
  // lines, so a map built from one branch may not describe another.
  let translated;
  try {
    if (direction === 'none') {
      translated = {text: patchText, stats: {translated: 0, untranslated: []}};
    } else {
      // Only needed when translating, and it costs a git read per package.
      const packageMap = buildPackageMap({repoDir, ref: target, gitRepoDir: options.gitRepoDir});
      if (packageMap.size === 0) throw new Error(`no packages found at ${target}`);
      const sourceRoots = buildSourceRoots({repoDir, ref: target, gitRepoDir: options.gitRepoDir});

      translated = translatePatch(patchText, packageMap, 'to-source', sourceRoots);
      if (translated.stats.untranslated.length) {
        results.push({
          target,
          status: 'UNMAPPED',
          detail: translated.stats.untranslated.join(' '),
        });
        continue;
      }
    }
  } catch (exception) {
    results.push({target, status: 'ERROR', detail: exception.message});
    continue;
  }

  const patchFile = path.join(scratch, `${branchName(target)}.patch`);
  fs.writeFileSync(patchFile, translated.text);

  const branch = branchName(target);
  const exists = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], {allowFailure: true});
  // A previous run's branch can hold a resolved conflict. Replacing it silently
  // would throw that away, so it takes saying so.
  if (exists && !options.force) {
    results.push({target, status: 'ERROR', detail: `branch ${branch} already exists, --force to replace`});
    continue;
  }
  if (exists) git(['branch', '-D', branch], {allowFailure: true});

  if (git(['checkout', '-b', branch, target], {allowFailure: true}) === null) {
    results.push({target, status: 'ERROR', detail: `cannot check out ${target}`});
    continue;
  }

  // git apply is atomic: one rejected file rolls the whole patch back. Without
  // the stderr the result is an unexplained "nothing applied", when in practice
  // it usually means a single hunk is already present upstream.
  // --3way merges using the patch's blob ids and is atomic: one rejected file
  // rolls the whole patch back. --reject applies what it can and leaves .rej
  // behind, which is what you want for a large patch where one hunk has drifted.
  // git refuses the two together, so this is a mode, not a flag.
  const applyArgs = options.partial ? ['apply', '--reject'] : ['apply', '--3way'];

  // Rejects from an earlier target are still untracked here, so only the ones
  // this apply produces are attributed to this target.
  const rejectsBefore = new Set(listRejects());

  let applyOutput = '';
  let applyFailed = false;
  try {
    execFileSync('git', ['-C', repoDir, ...applyArgs, patchFile], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (exception) {
    applyFailed = true;
    applyOutput = `${exception.stdout || ''}${exception.stderr || ''}`;
  }

  const rejects = listRejects().filter(file => !rejectsBefore.has(file));

  const blockedFiles = [...new Set(
    [...applyOutput.matchAll(/error: patch failed: ([^:\n]+):/g)].map(match => match[1])
  )];

  // Keyed by the b side path, which is the form git reports in "patch failed".
  const sectionsByFile = new Map();
  let openSection = null;
  for (const line of translated.text.split('\n')) {
    const header = line.match(/^diff --git (\S+) (\S+)/);
    if (header) {
      openSection = [];
      sectionsByFile.set(header[2].replace(/^[ab]\//, ''), openSection);
    }
    if (openSection) openSection.push(line);
  }

  // The file set the applied count is checked against. A plain diff -u has no
  // diff --git headers, so fall back to the +++/--- markers; a body line that
  // happens to start with them can only add a name no porcelain entry matches.
  const patchFiles = new Set(sectionsByFile.keys());
  if (patchFiles.size === 0) {
    for (const line of translated.text.split('\n')) {
      const marker = line.match(/^(?:---|\+\+\+) (\S+)/);
      if (marker && marker[1] !== '/dev/null') {
        patchFiles.add(marker[1].replace(/^[ab]\//, ''));
      }
    }
  }

  // A file can fail to apply because the fix is already present by another
  // route, which looks identical to a real conflict in git's output. Comparing
  // that file's own added lines against the file on disk distinguishes the two
  // well enough to tell a reviewer where to look. It is a signal, not a proof.
  const alreadyPresent = (file) => {
    const target = path.join(repoDir, file);
    const section = sectionsByFile.get(file);
    if (!section || !fs.existsSync(target)) return null;
    const contents = fs.readFileSync(target, 'utf8');
    const added = section
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1).trim())
      .filter(line => line.length > 12);
    if (added.length === 0) return null;
    const found = added.filter(line => contents.includes(line)).length;
    return Math.round((found / added.length) * 100);
  };

  const tot = patchFiles.size;
  const CONFLICT_CODES = /^(UU|AA|DD|AU|UA|DU|UD) /;
  const status = git(['status', '--porcelain'], {allowFailure: true}) || '';
  const conflicts = status.split('\n')
    .filter(line => CONFLICT_CODES.test(line))
    .map(line => line.slice(3));
  // --3way stages what it applies; --reject leaves it unstaged. Count whatever
  // the patch names that changed under any code — deletions and renames
  // included, which an allowlist of M/A used to drop — never the .rej files,
  // and nothing the patch does not name, so unrelated working tree noise
  // cannot inflate the number. A rename line reads "old -> new"; the b side is
  // the one the patch names.
  const applied = status.split('\n')
    .filter(line => line.trim() && !CONFLICT_CODES.test(line) && !line.endsWith('.rej'))
    .map(line => line.slice(3).split(' -> ').pop())
    .filter(file => patchFiles.has(file))
    .length;

  // Committed before classifying, and for conflicted and partial results too.
  // Anything left in the working tree blocks the next target's checkout, which
  // used to make one conflict fail every target after it. Conflict markers are
  // worth committing: the branch exists only to hold this result, and the
  // markers are what a reviewer resolves. Rejects stay uncommitted, as working
  // notes next to the file they belong to.
  if (applied > 0 || conflicts.length) {
    git(['add', '--all', '--', ':!*.rej'], {allowFailure: true});
    const subject = conflicts.length
      ? `Port Adobe security patch ${label} (unresolved conflicts)`
      : `Port Adobe security patch ${label}`;
    git(['commit', '-m', subject], {allowFailure: true});
  }

  if (rejects.length) {
    results.push({
      target,
      status: 'PARTIAL',
      detail: `${applied} of ${tot} applied, ${rejects.length} rejected: ` +
        rejects.map(f => f.replace(/\.rej$/, '')).join(' '),
      branch,
    });
    continue;
  }

  if (applied === 0 && conflicts.length === 0) {
    // Nothing was committed, so the branch is an empty duplicate of its
    // target. Leaving it around would make the next run demand --force for a
    // branch holding no result.
    git(['checkout', '--detach'], {allowFailure: true});
    git(['branch', '-D', branch], {allowFailure: true});

    if (blockedFiles.length) {
      results.push({
        target,
        status: 'REJECTED',
        detail: `rolled back, blocked by: ${blockedFiles.map(file => {
          const pct = alreadyPresent(file);
          return pct === null ? file : `${file} (${pct}% of added lines already present)`;
        }).join(' ')}`,
      });
      continue;
    }

    // git apply can fail without a "patch failed" line — a corrupt patch, or a
    // delete/rename of a file absent on this branch. That used to read as
    // NO-OP, which looks like an already-applied patch and exits 0.
    if (applyFailed) {
      const lines = applyOutput.split('\n').map(line => line.trim()).filter(Boolean);
      results.push({
        target,
        status: 'ERROR',
        detail: lines.find(line => line.startsWith('error:')) || lines[0] || 'git apply failed',
      });
      continue;
    }

    results.push({target, status: 'NO-OP', detail: 'patch produced no changes'});
    continue;
  }

  if (conflicts.length) {
    results.push({
      target,
      status: 'CONFLICT',
      detail: `${applied} applied, ${conflicts.length} conflicted: ${conflicts.join(' ')}`,
      branch,
    });
    continue;
  }

  results.push({target, status: 'CLEAN', detail: `${applied} files applied`, branch});
}

fs.rmSync(scratch, {recursive: true, force: true});

if (startingRef) {
  // Every result is committed to its own branch, so returning to the starting
  // ref does not discard anything.
  if (git(['checkout', startingRef], {allowFailure: true}) === null) {
    const now = (git(['rev-parse', '--abbrev-ref', 'HEAD'], {allowFailure: true}) || '?').trim();
    console.error(`Warning: could not return to ${startingRef}; the checkout is left on ${now}`);
  }
}

const widthOf = (key, heading) =>
  Math.max(heading.length, ...results.map(r => String(r[key] || '-').length)) + 2;

const columns = [
  ['target', 'TARGET'],
  ['status', 'STATUS'],
  ['branch', 'BRANCH'],
  ['detail', 'DETAIL'],
];

console.log('');
console.log(columns.map(([key, heading], i) =>
  i === columns.length - 1 ? heading : heading.padEnd(widthOf(key, heading))
).join(''));
console.log('-'.repeat(
  columns.slice(0, -1).reduce((sum, [key, heading]) => sum + widthOf(key, heading), 0) + 40
));
for (const result of results) {
  console.log(columns.map(([key, heading], i) => {
    const value = String(result[key] || (key === 'branch' ? '-' : ''));
    return i === columns.length - 1 ? value : value.padEnd(widthOf(key, heading));
  }).join(''));
}
console.log('');

const conflicted = results.filter(r => r.status === 'CONFLICT');
if (conflicted.length) {
  console.log(`${conflicted.length} branch(es) carry conflict markers and need resolving.`);
}

const needsAPerson = ['ERROR', 'UNMAPPED', 'REJECTED', 'CONFLICT', 'PARTIAL'];
process.exit(results.some(r => needsAPerson.includes(r.status)) ? 1 : 0);
