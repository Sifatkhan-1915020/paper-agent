#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";

import { loadPdfText, renderPagesToPng } from "./pdf.js";
import {
  analyzePaper,
  comparePapers,
  findBenchmarks,
  findMethodologyFigure,
  generateImplementation,
} from "./agent.js";
import { savePaper, loadAllPapers, findPaper } from "./store.js";
import type { PaperAnalysis } from "./types.js";

const program = new Command();

program
  .name("paper-agent")
  .description("An agent that reads research PDFs and extracts field, method, result, and impact.")
  .version("0.1.0")
  .option("-t, --thread <name>", 'name of this research "thread" / session', "default");

function printAnalysis(a: PaperAnalysis): void {
  console.log(`\n${a.title ?? a.fileName}`);
  console.log("-".repeat(60));
  console.log(`1. Field:  ${a.field}`);
  console.log(`\n2. Method: ${a.method}`);
  console.log(`\n3. Result: ${a.result}`);
  console.log(`\n4. Impact: ${a.impact}\n`);
}

function assertPdfExists(pdfPath: string): void {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }
}

async function runAnalyze(pdfPath: string, thread: string): Promise<PaperAnalysis> {
  assertPdfExists(pdfPath);
  console.log(`Reading ${pdfPath} ...`);
  const { text, pageCount } = loadPdfText(pdfPath);
  console.log(`Extracted ${pageCount} page(s). Asking OpenCode to analyze ...`);

  const raw = await analyzePaper(text, path.basename(pdfPath));
  const analysis: PaperAnalysis = {
    id: randomUUID(),
    fileName: path.basename(pdfPath),
    title: raw.title,
    field: raw.field,
    method: raw.method,
    result: raw.result,
    impact: raw.impact,
    analyzedAt: new Date().toISOString(),
    pageCount,
  };

  const savedTo = savePaper(thread, analysis);
  printAnalysis(analysis);
  console.log(`Saved to ${savedTo} (thread: "${thread}")`);
  return analysis;
}

async function ensureAnalyzed(pdfPath: string, thread: string): Promise<PaperAnalysis> {
  const existing = findPaper(thread, path.basename(pdfPath));
  if (existing) {
    console.log(`Using existing analysis for ${existing.fileName} in thread "${thread}".`);
    return existing;
  }
  return runAnalyze(pdfPath, thread);
}

program
  .command("analyze <pdf>")
  .description("Analyze a single paper: field, method, result, impact")
  .action(async (pdf: string) => {
    const { thread } = program.opts<{ thread: string }>();
    await runAnalyze(path.resolve(pdf), thread);
  });

program
  .command("compare")
  .description("Compare every paper analyzed so far in this thread, as a Markdown table")
  .action(async () => {
    const { thread } = program.opts<{ thread: string }>();
    const papers = loadAllPapers(thread);

    if (papers.length < 2) {
      console.log(
        `Thread "${thread}" has ${papers.length} analyzed paper(s). Run "paper-agent analyze <pdf>" on at least 2 papers in this thread before comparing.`
      );
      return;
    }

    console.log(`Comparing ${papers.length} papers in thread "${thread}" ...`);
    const table = await comparePapers(papers);
    console.log("\n" + table);

    const outFile = path.join(process.cwd(), ".paper-agent", thread, `comparison-${Date.now()}.md`);
    fs.writeFileSync(outFile, table);
    console.log(`\nSaved comparison to ${outFile}`);
  });

program
  .command("benchmark <pdf>")
  .description("Find the standard benchmark work for this paper's field")
  .action(async (pdf: string) => {
    const { thread } = program.opts<{ thread: string }>();
    const analysis = await ensureAnalyzed(path.resolve(pdf), thread);

    console.log(`\nSearching benchmarks for field: ${analysis.field} ...`);
    const result = await findBenchmarks(analysis.field, analysis.method);
    console.log("\n" + result);
  });

program
  .command("figures <pdf>")
  .description("Locate and analyze the paper's methodology diagram")
  .action(async (pdf: string) => {
    const { thread } = program.opts<{ thread: string }>();
    const resolved = path.resolve(pdf);
    assertPdfExists(resolved);

    console.log(`Rendering pages of ${resolved} ...`);
    const images = renderPagesToPng(resolved, 20, 120);
    console.log(`Rendered ${images.length} page(s). Asking OpenCode to locate the methodology figure ...`);

    const analysisText = await findMethodologyFigure(images);
    console.log("\n" + analysisText);

    const match = analysisText.match(/PAGE:\s*(\d+)/i);
    if (match) {
      const pageNum = parseInt(match[1], 10);
      const found = images.find((img) => img.pageNumber === pageNum);
      if (found) {
        const dir = path.join(process.cwd(), ".paper-agent", thread, "figures");
        fs.mkdirSync(dir, { recursive: true });
        const outPath = path.join(dir, `${path.basename(pdf, ".pdf")}-page${pageNum}.png`);
        fs.writeFileSync(outPath, found.pngBuffer);
        console.log(`\nSaved methodology figure image to ${outPath}`);
      }
    }
  });

program
  .command("code <pdf>")
  .description("Generate a starter implementation, if the method needs one")
  .action(async (pdf: string) => {
    const { thread } = program.opts<{ thread: string }>();
    const resolved = path.resolve(pdf);
    assertPdfExists(resolved);
    const analysis = await ensureAnalyzed(resolved, thread);
    const { text } = loadPdfText(resolved);

    console.log(`\nChecking whether "${analysis.title ?? analysis.fileName}" needs an implementation ...`);
    const raw = await generateImplementation(text, analysis);

    if (/^NO_CODE_NEEDED/i.test(raw.trim())) {
      console.log("\n" + raw.trim());
      return;
    }

    const langMatch = raw.match(/LANGUAGE:\s*(\S+)/i);
    const fileMatch = raw.match(/FILENAME:\s*(\S+)/i);
    const codeMatch = raw.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);

    if (!codeMatch) {
      console.log("Could not parse a code block from OpenCode's response. Raw response:\n\n" + raw);
      return;
    }

    const dir = path.join(process.cwd(), ".paper-agent", thread, "implementations");
    fs.mkdirSync(dir, { recursive: true });
    const fileName = fileMatch?.[1] ?? `${path.basename(pdf, ".pdf")}.py`;
    const outPath = path.join(dir, fileName);
    fs.writeFileSync(outPath, codeMatch[1]);

    console.log(`\nLanguage: ${langMatch?.[1] ?? "unknown"}`);
    console.log(`Saved implementation to ${outPath}`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("\nSomething went wrong:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
