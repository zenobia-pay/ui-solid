#!/usr/bin/env node

import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runCommand(command, cwd = process.cwd()) {
  console.log(`Running: ${command}`);
  try {
    execSync(command, {
      cwd,
      stdio: "inherit",
      encoding: "utf8",
    });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    process.exit(1);
  }
}

async function getCurrentVersion() {
  const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
  return packageJson.version;
}

async function main() {
  console.log("🚀 Starting release process...");

  // Step 1: Version and commit changes
  console.log("\n📦 Versioning with changeset...");
  runCommand("changeset version");
  runCommand("git add .");
  runCommand('git commit -m "chore: release"');

  // Step 2: Get the new version
  const version = await getCurrentVersion();
  console.log(`\n📋 New version: ${version}`);

  // Step 3: Build all packages
  console.log("\n🔨 Building packages...");
  runCommand("npm run build");
  runCommand("npm run build:zenobia");
  runCommand("npm run build:modal");

  // Step 4: Push to current repository
  console.log("\n📤 Pushing to current repository...");
  runCommand("git push");
  runCommand("git push --tags");

  // Step 5: Publish to npm
  console.log("\n📦 Publishing to npm...");
  runCommand("changeset publish");

  // Step 6: Deploy to landing page
  console.log("\n🌐 Deploying to landing page...");

  try {
    // Get the root directory (3 levels up from packages/ui-solid/scripts)
    const rootDir = path.join(__dirname, "../../..");

    // Create version directory
    const versionDir = path.join(
      rootDir,
      "apps",
      "landing-page",
      "public",
      "embed",
      version
    );
    await fs.mkdir(versionDir, { recursive: true });

    // Create latest directory
    const latestDir = path.join(
      rootDir,
      "apps",
      "landing-page",
      "public",
      "embed",
      "latest"
    );
    await fs.mkdir(latestDir, { recursive: true });

    // Copy build outputs
    console.log("📋 Copying build outputs...");

    // Copy zenobia build
    const zenobiaSource = path.join(
      __dirname,
      "../dist/zenobia/zenobia-pay.js"
    );
    const zenobiaDest = path.join(versionDir, "zenobia-pay.js");
    const zenobiaLatestDest = path.join(latestDir, "zenobia-pay.js");
    await fs.copyFile(zenobiaSource, zenobiaDest);
    await fs.copyFile(zenobiaSource, zenobiaLatestDest);

    // Copy modal build
    const modalSource = path.join(
      __dirname,
      "../dist/zenobia-modal/zenobia-pay-modal.js"
    );
    const modalDest = path.join(versionDir, "zenobia-pay-modal.js");
    const modalLatestDest = path.join(latestDir, "zenobia-pay-modal.js");
    await fs.copyFile(modalSource, modalDest);
    await fs.copyFile(modalSource, modalLatestDest);

    // Commit and push the landing page changes
    console.log("💾 Committing landing page changes...");
    runCommand("git add apps/landing-page/public/embed/");
    runCommand(
      `git commit -m "feat: add version ${version} of zenobia-pay components"`
    );
    runCommand("git push");

    console.log("✅ Successfully deployed to landing page!");
  } catch (error) {
    console.error("❌ Error deploying to landing page:", error);
    process.exit(1);
  }

  console.log("\n🎉 Release completed successfully!");
}

main().catch((error) => {
  console.error("❌ Release failed:", error);
  process.exit(1);
});
