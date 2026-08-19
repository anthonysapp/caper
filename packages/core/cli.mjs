#!/usr/bin/env node

import { bgRed, bold, green, red, white } from 'kleur/colors';

import fs from 'node:fs';
import process from 'node:process';
import { add } from './cli/add.mjs';
import { agent } from './cli/agent.mjs';
import { generateCaptions } from './cli/audio/cc.mjs';
import { compress } from './cli/audio/index.mjs';
import { create } from './cli/create.mjs';
import { installPeerDeps } from './cli/install-peerdeps.mjs';
import { update } from './cli/update.mjs';
import { generateVoiceoverCSV } from './cli/voiceover/index.mjs';

const currentVersion = process.versions.node;
const requiredMajorVersion = parseInt(currentVersion.split('.')[0], 10);
const minimumMajorVersion = 18;

if (requiredMajorVersion < minimumMajorVersion) {
  console.error(`Node.js v${currentVersion} is out of date and unsupported!`);
  console.error(`Please use Node.js v${minimumMajorVersion} or higher.`);
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

const args = process.argv.slice(2);

const hr = () => {
  return console.log(bold(green('-'.repeat(80))));
};

if (!(!args[0] || args[0] === 'version')) {
  console.log(bold(green(`Caper ${version}`)));
}

if (args.length === 0) {
  console.log(bold(green('Caper - Please provide a subcommand.')));
  process.exit(1);
}

let pkg, newVersion, voInputDir, voCSVDirectory, audioDirectory, captionsCSVDirectory, captionsOutputDirectory;

switch (args[0]) {
  case 'install':
    await installPeerDeps();
    break;
  case 'version':
    break;
  // `dev` / `build` / `preview` / `start` were removed in 0.2.0: a project runs
  // vite directly now, with `caper()` in its own vite.config. Named here so the
  // error says what to do rather than just "unknown subcommand".
  case 'dev':
  case 'start':
  case 'build':
  case 'preview':
    console.error(
      bold(bgRed(white(`Caper - "${args[0]}" was removed in 0.2.0.`))),
      red(`Run vite directly: \`vite\` to develop, \`vite build\` to build.`),
    );
    console.error(red(`Your vite.config should contain: plugins: [caper()] — from '@caperjs/core/vite'.`));
    process.exit(1);
    break;
  case 'add':
    await add(args.slice(1));
    break;
  case 'agent':
    await agent(args.slice(1));
    break;
  case 'create': {
    let packageManager = 'npm'; // Default to npm
    let projectPath = '.'; // Default to current directory

    // Parse arguments
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--use-yarn') {
        packageManager = 'yarn';
      } else if (args[i] === '--use-pnpm') {
        packageManager = 'pnpm';
      } else if (!args[i].startsWith('--')) {
        projectPath = args[i];
      }
    }
    await create(projectPath, packageManager);
    break;
  }
  case 'update':
    hr();
    console.log(bold(green(`Updating Caper to the latest version...`)));
    await update();
    pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
    newVersion = pkg.version;
    console.log(`${bold(green(`Updated Caper to version ${newVersion}`))}`);
    hr();
    break;
  case 'vo':
    hr();
    switch (args[1]) {
      case 'generate':
        console.log(bold(green(`Caper is generating a new voiceover file...`)));
        voInputDir = args[2] || './src/locales';
        voCSVDirectory = args[3] || './src/assets/audio/vo/csv';
        try {
          await generateVoiceoverCSV(voInputDir, voCSVDirectory);
          console.log(
            bold(green(`Caper has finished generating your voiceover CSV(s)! Find them in "${voCSVDirectory}."`)),
          );
        } catch (e) {
          console.log(e);
          console.error(bold(bgRed(white(`Error generating voiceover CSV(s):`))), red(e));
        }
        break;
      default:
        console.error(bold(bgRed(white(`Unknown VO command: "${args[1]}".`))), red(`Please use "generate".`));
        break;
    }
    hr();
    break;
  case 'audio':
    hr();
    switch (args[1]) {
      case 'compress':
        audioDirectory = args[2] || './src/assets/audio';
        console.log(bold(green(`Caper is compressing your audio files...`)));
        try {
          await compress(audioDirectory);
        } catch (e) {
          console.error(red(`Error compressing your audio files: ${e}`));
        }
        console.log(
          bold(green(`Caper has finished compressing your audio files! Find them in "${audioDirectory}/output."`)),
        );
        break;
      case 'captions':
        captionsCSVDirectory = args[2] || './src/assets/audio/captions';
        captionsOutputDirectory = args[3] || './src/assets/json';
        console.log(bold(green(`Caper is preparing your closed captioning files...`)));
        try {
          await generateCaptions(captionsCSVDirectory, captionsOutputDirectory);
          console.log(
            bold(
              green(
                `Caper has finished generating your closed captioning files! Find them in "${captionsOutputDirectory}/cc.json"`,
              ),
            ),
          );
        } catch (e) {
          console.error(bold(bgRed(white(`Error generating captions:`))), red(e));
        }
        break;
      default:
        console.error(
          bold(bgRed(white(`Unknown audio command: "${args[1]}".`))),
          red(`Please use "compress" or "captions".`),
        );
        break;
    }
    hr();
    break;
  default:
    console.error(red(bold(`Caper - Unknown subcommand: ${args[0]}`)));
    process.exit(1);
}
