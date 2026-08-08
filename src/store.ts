import fs from "node:fs";
import path from "node:path";
import type { PaperAnalysis } from "./types.js";

const THREAD_ROOT = ".paper-agent";

function getThreadDir(thread: string): string {
  const dir = path.join(process.cwd(), THREAD_ROOT, thread);
  fs.mkdirSync(path.join(dir, "papers"), { recursive: true });
  fs.mkdirSync(path.join(dir, "figures"), { recursive: true });
  fs.mkdirSync(path.join(dir, "implementations"), { recursive: true });
  return dir;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.[^./]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function savePaper(thread: string, analysis: PaperAnalysis): string {
  const dir = getThreadDir(thread);
  const file = path.join(dir, "papers", `${slugify(analysis.fileName)}.json`);
  fs.writeFileSync(file, JSON.stringify(analysis, null, 2));
  return file;
}

export function loadAllPapers(thread: string): PaperAnalysis[] {
  const dir = path.join(getThreadDir(thread), "papers");
  return fs
    .readdirSync(dir)
    .filter((fileName: string) => fileName.endsWith(".json"))
    .map((fileName: string) => JSON.parse(fs.readFileSync(path.join(dir, fileName), "utf8")) as PaperAnalysis)
    .sort((a: PaperAnalysis, b: PaperAnalysis) => a.analyzedAt.localeCompare(b.analyzedAt));
}

export function findPaper(thread: string, fileName: string): PaperAnalysis | undefined {
  const target = slugify(fileName);
  return loadAllPapers(thread).find((p) => slugify(p.fileName) === target);
}
