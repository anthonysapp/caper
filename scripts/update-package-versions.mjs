import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname in ES6 module
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(dirname(__filename), '../');

const mainPackageJsonPath = resolve(__dirname, './package.json');
const mainPackageJson = JSON.parse(readFileSync(mainPackageJsonPath, 'utf8'));
const { version: caperVersion } = mainPackageJson;

// Load the framework package.json to get the versions
const frameworkPackageJsonPath = resolve(__dirname, './packages/core/package.json');
const frameworkPackageJson = JSON.parse(readFileSync(frameworkPackageJsonPath, 'utf8'));
const {
  dependencies: { 'pixi.js': pixiJsVersion, '@pixi/sound': pixiSoundVersion },
  devDependencies: { 'vite-plugin-dts': vitePluginDtsVersion },
} = frameworkPackageJson;

// vite became a peer dependency of the framework in 0.2.0 (an app owns its build
// tool), so read it from there. The `dependencies` fallback keeps this working
// against an older checkout; without it a missing key would write `undefined` and
// silently delete vite from every plugin package.
const viteVersion = frameworkPackageJson.peerDependencies?.vite ?? frameworkPackageJson.dependencies?.vite;

// Function to update package.json files
function updatePackageJson(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.version) {
    packageJson.version = caperVersion;
  }
  if (packageJson.dependencies) {
    if (packageJson.dependencies['pixi.js'] && !packageJson.dependencies['pixi.js']?.includes('workspace')) {
      packageJson.dependencies['pixi.js'] = pixiJsVersion;
    }
    if (packageJson.dependencies['@pixi/sound'] && !packageJson.dependencies['@pixi/sound']?.includes('workspace')) {
      packageJson.dependencies['@pixi/sound'] = pixiSoundVersion;
    }
    if (packageJson.dependencies['@caperjs/core'] && !packageJson.dependencies['@caperjs/core']?.includes('workspace')) {
      packageJson.dependencies['@caperjs/core'] = caperVersion;
    }
    if (packageJson.dependencies['vite'] && !packageJson.dependencies['vite']?.includes('workspace')) {
      packageJson.dependencies['vite'] = viteVersion;
    }
  }
  if (packageJson.peerDependencies) {
    if (packageJson.peerDependencies['pixi.js']) {
      packageJson.peerDependencies['pixi.js'] = pixiJsVersion;
    }
    if (packageJson.peerDependencies['@pixi/sound']) {
      packageJson.peerDependencies['@pixi/sound'] = pixiSoundVersion;
    }
    if (packageJson.peerDependencies['@caperjs/core']) {
      packageJson.peerDependencies['@caperjs/core'] = caperVersion;
    }
    if (packageJson.peerDependencies['vite']) {
      packageJson.peerDependencies['vite'] = viteVersion;
    }
  }

  if (packageJson.devDependencies) {
    if (packageJson.devDependencies['vite-plugin-dts']) {
      packageJson.devDependencies['vite-plugin-dts'] = vitePluginDtsVersion;
    }
    if (packageJson.devDependencies['@caperjs/core']) {
      packageJson.devDependencies['@caperjs/core'] = caperVersion;
    }
    if (packageJson.devDependencies['vite']) {
      packageJson.devDependencies['vite'] = viteVersion;
    }
  }

  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`Updated ${packageJsonPath}`);
}

// Glob pattern to find package.json files
const globPattern =
  '{./packages/core/package.json,./packages/plugin-*/package.json,./apps/kitchen-sink/package.json,./packages/templates/*/package.json}';

function run() {
  const files = glob.sync(globPattern);
  files.forEach(updatePackageJson);
}

run();
