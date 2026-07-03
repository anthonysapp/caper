import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cwd = process.cwd();
/**
 *
 * @returns Promise<void>
 */
export async function installPeerDeps() {
  // Read package.json to get peer dependencies
  const caperPackageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  const peerDependencies = caperPackageJson.peerDependencies;

  if (!peerDependencies) {
    console.log('No peer dependencies found.');
    return 0;
  }

  const dependencies = Object.entries(peerDependencies)
    .map(([dep, version]) => `${dep}@${version}`)
    .join(' ');
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf8'));
  // Detect package manager
  let packageManager;

  // check for packageManager entry in package.json
  if (packageJson.packageManager) {
    if (packageJson.packageManager?.includes('yarn')) {
      packageManager = 'yarn add';
    } else if (packageJson.packageManager?.includes('pnpm')) {
      packageManager = 'pnpm add';
    } else if (packageJson.packageManager?.includes('npm')) {
      packageManager = 'npm install';
    }
  }
  if (!packageManager) {
    if (fs.existsSync(path.resolve(cwd, 'yarn.lock'))) {
      packageManager = 'yarn add';
    } else if (fs.existsSync(path.resolve(cwd, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm add';
    } else if (fs.existsSync(path.resolve(cwd, 'package-lock.json'))) {
      packageManager = 'npm install';
    } else {
      console.log('No lockfile detected. Defaulting to npm.');
      packageManager = 'npm install';
    }
  }

  // Install peer dependencies
  console.log(`Installing peer dependencies using ${packageManager}`);
  return execSync(`${packageManager} ${dependencies}`, { stdio: 'inherit' });
}
