#!/usr/bin/env node
// Re-installs the vendored agent skills in .claude/skills/ (and vendor/pixelfx/).
//
//   node scripts/sync-skills.mjs              # full re-sync from the pinned refs below
//   node scripts/sync-skills.mjs --agents     # also mirror into .agents/skills/ (Codex, Cursor, Copilot)
//   node scripts/sync-skills.mjs --shim-only  # rebuild only the pixelfx SKILL.md shim
//   node scripts/sync-skills.mjs --check      # validate frontmatter of the installed skills
//
// Sources are pinned to exact commits so a re-run is reproducible. Bump REFS to update.
// Requires git and network access to github.com. Node 18+.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Every directory an agent tool looks in. .claude/skills is always written;
// .agents/skills is added with --agents so Codex, Cursor and Copilot see the same skills.
function skillDirs() {
  const dirs = [join(ROOT, ".claude", "skills")];
  if (process.argv.includes("--agents")) dirs.push(join(ROOT, ".agents", "skills"));
  return dirs;
}

/** Every skill directory that is present on disk, for validation. */
function presentSkillDirs() {
  const dirs = skillDirs();
  const agents = join(ROOT, ".agents", "skills");
  if (!dirs.includes(agents) && existsSync(agents)) dirs.push(agents);
  return dirs;
}

// Pinned upstream commits.
const REFS = {
  openaiSkills: {
    repo: "https://github.com/openai/skills.git",
    commit: "49f948faa9258a0c61caceaf225e179651397431", // 2026-06-23
  },
  pixelfx: {
    repo: "https://github.com/patch-gg/pixelfx.git",
    commit: "5294518ce7c72e48b6100a744596e0acf57f2826", // v0.3.1, 2026-11-12
  },
};

// skill name -> [path inside openai/skills]
const OPENAI_SKILLS = {
  "openai-docs": "skills/.curated/openai-docs",
  imagegen: "skills/.system/imagegen",
  "playwright-interactive": "skills/.curated/playwright-interactive",
};

// Files kept out of vendor/pixelfx: nested git metadata, render output, demo media.
const PIXELFX_EXCLUDE = [".git", "records", "sheets", "node_modules", "docs/readme"];

const PIXELFX_NOTE = `> **Vendored checkout.** This repository keeps the pixelfx checkout at \`vendor/pixelfx/\`
> (library in \`src/\`, tools, docs). It is already installed — do not clone it again.
> Run every command in this skill from that directory:
> \`cd vendor/pixelfx && node tools/render.mjs fire/torch\`.
> Installed from patch-gg/pixelfx @ ${REFS.pixelfx.commit.slice(0, 7)} (v0.3.1).
> Refresh with \`node scripts/sync-skills.mjs\`.`;

const PIXELFX_STEP_ONE_OLD =
  "1. Work in a pixelfx checkout. If the working directory has no `tools/render.mjs`, clone one next to the\n   project: `git clone https://github.com/patch-gg/pixelfx`. No install step: the tools use only Node.";
const PIXELFX_STEP_ONE_NEW =
  "1. Work in the vendored checkout, `vendor/pixelfx/`, from the repository root. No install step: the tools use\n   only Node. If it is missing, run `node scripts/sync-skills.mjs` instead of cloning by hand.";

/** Validates every installed SKILL.md against the Agent Skills frontmatter rules. */
export function checkSkills() {
  const problems = [];
  for (const root of presentSkillDirs()) {
    if (!existsSync(root)) {
      problems.push(`${root}: missing (run node scripts/sync-skills.mjs${root.includes(".agents") ? " --agents" : ""})`);
      continue;
    }
    for (const name of readdirSync(root)) {
      const file = join(root, name, "SKILL.md");
      if (!existsSync(file)) {
        problems.push(`${root}/${name}: no SKILL.md`);
        continue;
      }
      const text = readFileSync(file, "utf8");
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) {
        problems.push(`${root}/${name}: no YAML frontmatter`);
        continue;
      }
      // Frontmatter values may be plain, single- or double-quoted, and may contain quotes.
      const field = (key) => {
        const raw = (fm[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m")) || [])[1];
        if (!raw) return undefined;
        const v = raw.trim();
        return /^(".*"|'.*')$/.test(v) ? v.slice(1, -1) : v;
      };
      const declared = field("name");
      const description = field("description");
      if (declared !== name) problems.push(`${root}/${name}: name "${declared}" != directory "${name}"`);
      if (!description) problems.push(`${root}/${name}: missing description`);
      else if (description.length > 1024) problems.push(`${root}/${name}: description ${description.length} chars (max 1024)`);
      if (!existsSync(join(root, name, "LICENSE.txt")) && !existsSync(join(root, name, "LICENSE"))) {
        problems.push(`${root}/${name}: license file missing`);
      }
    }
  }
  return problems;
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
}

function clonePinned({ repo, commit }, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  git(["clone", "--quiet", "--no-checkout", repo, dir]);
  git(["checkout", "--quiet", commit], dir);
  const head = git(["rev-parse", "HEAD"], dir).toString().trim();
  if (head !== commit) throw new Error(`checkout mismatch in ${dir}: ${head} != ${commit}`);
  return dir;
}

/** Builds .claude/skills/pixelfx/SKILL.md from the vendored upstream skill. */
export function writePixelfxShim() {
  const vendor = join(ROOT, "vendor", "pixelfx");
  const src = readFileSync(join(vendor, "skills", "pixelfx", "SKILL.md"), "utf8");
  if (!src.includes(PIXELFX_STEP_ONE_OLD)) {
    throw new Error("upstream pixelfx SKILL.md changed; re-check the shim patch in scripts/sync-skills.mjs");
  }
  let out = src.replace(PIXELFX_STEP_ONE_OLD, PIXELFX_STEP_ONE_NEW);
  // Insert the note right after the YAML frontmatter.
  const end = out.indexOf("\n---", 4);
  if (!out.startsWith("---") || end < 0) throw new Error("unexpected frontmatter in pixelfx SKILL.md");
  const cut = out.indexOf("\n", end + 1);
  out = out.slice(0, cut + 1) + "\n" + PIXELFX_NOTE + "\n" + out.slice(cut + 1);

  const dirs = skillDirs().map((root) => join(root, "pixelfx"));
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), out);
    cpSync(join(vendor, "LICENSE"), join(dir, "LICENSE.txt"));
    cpSync(join(vendor, "NOTICE.md"), join(dir, "NOTICE.md"));
  }
  return dirs;
}

function main() {
  if (process.argv.includes("--check")) {
    const problems = checkSkills();
    for (const p of problems) console.error(`FAIL ${p}`);
    if (problems.length) process.exit(1);
    console.log(`ok   ${presentSkillDirs().length} skill directories, frontmatter valid`);
    return;
  }

  if (process.argv.includes("--shim-only")) {
    console.log(`shim -> ${writePixelfxShim().join(", ")}`);
    return;
  }

  const work = join(tmpdir(), "game4-skills-sync");
  const openai = clonePinned(REFS.openaiSkills, join(work, "openai-skills"));
  const pixelfx = clonePinned(REFS.pixelfx, join(work, "pixelfx"));

  for (const [name, sub] of Object.entries(OPENAI_SKILLS)) {
    for (const root of skillDirs()) {
      const dest = join(root, name);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(join(openai, sub), dest, { recursive: true });
    }
    console.log(`skill ${name} <- openai/skills:${sub}`);
  }

  const vendor = join(ROOT, "vendor", "pixelfx");
  rmSync(vendor, { recursive: true, force: true });
  cpSync(pixelfx, vendor, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(pixelfx.length + 1).split("\\").join("/");
      return rel === "" || !PIXELFX_EXCLUDE.some((x) => rel === x || rel.startsWith(x + "/"));
    },
  });
  console.log(`checkout vendor/pixelfx <- patch-gg/pixelfx:${REFS.pixelfx.commit.slice(0, 7)}`);

  console.log(`shim -> ${writePixelfxShim().join(", ")}`);

  const problems = checkSkills();
  if (problems.length) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }
  console.log("done, frontmatter valid.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
