import { exec } from 'child_process';
import fs from 'fs';
import { glob } from 'glob';
import { resolve } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

function updateDependencyVersions(packageJson, version) {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies'];
  let modified = false;

  for (const section of sections) {
    if (packageJson[section]) {
      for (const [dep, depVersion] of Object.entries(packageJson[section])) {
        if (dep.startsWith('@caperjs/core') && depVersion === 'workspace:*') {
          packageJson[section][dep] = version;
          modified = true;
        }
      }
    }
  }

  return modified;
}

function resolvePackageDirs(patterns) {
  const allDirectories = new Set();

  for (const pattern of patterns) {
    // Accept globs ("packages/plugin-*"), expanded dirs, or comma-separated lists.
    for (const entry of pattern.split(',').map((pat) => pat.trim()).filter(Boolean)) {
      const matches = glob.sync(`${entry}/package.json`, { ignore: 'node_modules/**' });
      if (matches.length === 0 && fs.existsSync(resolve(entry, 'package.json'))) {
        allDirectories.add(entry);
        continue;
      }
      matches.forEach((file) => allDirectories.add(file.replace(/\/package\.json$/, '')));
    }
  }

  return [...allDirectories].sort();
}

function isAlreadyPublishedError(err) {
  const text = `${err?.message ?? ''}\n${err?.stdout ?? ''}\n${err?.stderr ?? ''}`;
  return (
    /cannot publish over the previously published versions/i.test(text) ||
    /EPUBLISHCONFLICT/i.test(text) ||
    /package already exists/i.test(text) ||
    (/E403/.test(text) && /previously published/i.test(text))
  );
}

function formatPublishError(err) {
  const stderr = String(err?.stderr ?? '').trim();
  const stdout = String(err?.stdout ?? '').trim();
  if (stderr) return stderr;
  if (stdout) return stdout;
  return err?.message ?? String(err);
}

function resolveRepoNpmrc(cwd) {
  // Publishing from a package subdir does not load the monorepo-root .npmrc
  // (npm only reads <package>/.npmrc). Prefer the repo token explicitly.
  const candidates = [resolve(cwd, '.npmrc'), resolve(cwd, '../.npmrc'), resolve(cwd, '../../.npmrc')];
  return candidates.find((path) => fs.existsSync(path)) ?? null;
}

async function publishPackages(patterns, { otp } = {}) {
  const cwd = process.cwd();
  const published = [];
  const skipped = [];
  const failed = [];
  const npmrc = resolveRepoNpmrc(cwd);

  if (npmrc) {
    console.log(`Using auth from ${npmrc}`);
  } else {
    console.warn('No repo .npmrc found; falling back to npm default auth (~/.npmrc).');
  }

  try {
    const packageDirs = resolvePackageDirs(patterns);
    console.log('Patterns:', patterns);
    console.log('Packages:', packageDirs);

    if (packageDirs.length === 0) {
      console.error('No packages matched the provided pattern(s).');
      process.exit(1);
    }

    for (const packageDir of packageDirs) {
      const absPackageDir = resolve(cwd, packageDir);
      process.chdir(absPackageDir);
      console.log(`\nPublishing package in ${packageDir}...`);

      const packageJsonPath = 'package.json';
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const packageName = `${packageJson.name}@${packageJson.version}`;
      const originalContent = fs.readFileSync(packageJsonPath, 'utf8');

      // Update workspace dependencies to current version
      const wasModified = updateDependencyVersions(packageJson, packageJson.version);

      if (wasModified) {
        // Write temporary package.json with updated versions
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }

      // Must chdir into the package: npm publish --prefix publishes the wrong
      // package in a monorepo. Also pass --userconfig so we use the repo token
      // (subdir publishes do not load the monorepo-root .npmrc).
      const args = ['publish', '--access', 'public'];
      if (npmrc) args.push('--userconfig', npmrc);
      if (otp) args.push(`--otp=${otp}`);

      try {
        const publishCmd = ['npm', ...args.map((a) => JSON.stringify(a))].join(' ');
        const { stdout, stderr } = await execAsync(publishCmd, { cwd: absPackageDir });
        if (stdout?.trim()) console.log(stdout.trim());
        if (stderr?.trim()) console.error(stderr.trim());
        console.log(`✓ Published ${packageName}`);
        published.push(packageName);
      } catch (err) {
        if (isAlreadyPublishedError(err)) {
          console.log(`↷ Skipped ${packageName} (already published)`);
          skipped.push(packageName);
        } else {
          console.error(`✗ Failed ${packageName}:`);
          console.error(formatPublishError(err));
          failed.push(packageName);
        }
      } finally {
        // Restore original package.json
        if (wasModified) {
          fs.writeFileSync(packageJsonPath, originalContent);
        }
      }
    }
  } catch (err) {
    console.error('Error finding directories:', err);
    process.exitCode = 1;
  } finally {
    process.chdir(cwd);
  }

  console.log('\nPublish summary');
  console.log(`  published: ${published.length}`);
  console.log(`  skipped:   ${skipped.length}`);
  console.log(`  failed:    ${failed.length}`);
  if (published.length) console.log(`  → ${published.join(', ')}`);
  if (skipped.length) console.log(`  → skipped: ${skipped.join(', ')}`);
  if (failed.length) {
    console.log(`  → failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('Publishing packages...');
  const args = process.argv.slice(2);
  const otpArg = args.find((arg) => arg.startsWith('--otp='));
  const otp = otpArg?.slice('--otp='.length) || process.env.NPM_OTP;
  // Use remaining args so shell-expanded globs (packages/plugin-a packages/plugin-b) still work.
  const patterns = args.filter((arg) => !arg.startsWith('--otp='));
  if (patterns.length === 0) {
    console.error('Please provide a glob pattern as an argument.');
    process.exit(1);
  }

  await publishPackages(patterns, { otp });
}

void run();
