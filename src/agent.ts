import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOpencode } from "@opencode-ai/sdk";
import type { FilePartInput, TextPartInput } from "@opencode-ai/sdk";
import type { PageImage } from "./pdf.js";
import type { PaperAnalysis, RawAnalysisResponse } from "./types.js";

type OpenCodeClient = Awaited<ReturnType<typeof createOpencode>>["client"];
type OpenCodeModel = {
  providerID: string;
  modelID: string;
};

type PromptPart = TextPartInput | FilePartInput;

function parseOpenCodeModel(model?: string): OpenCodeModel | undefined {
  if (!model) {
    return undefined;
  }

  const [providerID, ...modelParts] = model.split("/");
  const modelID = modelParts.join("/");
  if (!providerID || !modelID) {
    return undefined;
  }

  return { providerID, modelID };
}

function extractOpenCodeText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "");
  return JSON.parse(cleaned) as T;
}

async function withOpenCodeClient<T>(handler: (client: OpenCodeClient, model?: OpenCodeModel) => Promise<T>): Promise<T> {
  const { client, server } = await createOpencode({});

  try {
    const configResult = await client.config.get({ query: { directory: process.cwd() } });
    return await handler(client, parseOpenCodeModel(configResult.data?.model));
  } finally {
    server.close();
  }
}

async function promptOpenCode(options: {
  title: string;
  system: string;
  parts: PromptPart[];
  tools?: Record<string, boolean>;
}): Promise<string> {
  return withOpenCodeClient(async (client, model) => {
    const sessionResult = await client.session.create({
      query: { directory: process.cwd() },
      body: {
        title: options.title,
      },
    });

    if (!sessionResult.data) {
      throw new Error("OpenCode did not return a session");
    }

    const responseResult = await client.session.prompt({
      path: { id: sessionResult.data.id },
      query: { directory: process.cwd() },
      body: {
        ...(model ? { model } : {}),
        system: options.system,
        ...(options.tools ? { tools: options.tools } : {}),
        parts: options.parts,
      },
    });

    if (!responseResult.data) {
      throw new Error("OpenCode did not return a response");
    }

    return extractOpenCodeText(responseResult.data.parts);
  });
}

/** 1. Field  2. Method  3. Result  4. Impact — extracted as structured JSON. */
export async function analyzePaper(paperText: string, fileName: string): Promise<RawAnalysisResponse> {
  const system = `You are a meticulous research-paper analyst. You read academic papers and extract exactly four things: the field of research, the method used, the result obtained, and the real-world impact of the work.

Respond with ONLY a JSON object, no markdown fences, no commentary, matching this exact shape:
{"title": string, "field": string, "method": string, "result": string, "impact": string}

Keep each field to 2-4 concise, specific sentences. Avoid generic filler like "this paper is important". If the text is truncated or a section is missing, do your best with what's given rather than refusing.`;

  const raw = await promptOpenCode({
    title: `paper-analysis: ${fileName}`,
    system,
    parts: [
      {
        type: "text",
        text: `Paper file: ${fileName}\n\nFull extracted text:\n\n${paperText}`,
      },
    ],
  });

  return parseJsonLoose<RawAnalysisResponse>(raw);
}

/** Compare command: table across every paper analyzed so far in this thread. */
export async function comparePapers(papers: PaperAnalysis[]): Promise<string> {
  const system = `You are a research analyst. You will be given structured summaries of multiple papers (field, method, result, impact already extracted). Produce a single Markdown comparison table, one row per paper, with columns: Paper | Field | Method | Result | Impact. After the table, add a short "Key differences" section with 3-5 bullet points on the most important contrasts between the papers. Respond with ONLY Markdown, no preamble or closing remarks.`;

  const userContent = papers
    .map(
      (p, i) =>
        `Paper ${i + 1}: ${p.title ?? p.fileName}\nField: ${p.field}\nMethod: ${p.method}\nResult: ${p.result}\nImpact: ${p.impact}`
    )
    .join("\n\n");

  return promptOpenCode({
    title: "paper-agent: compare",
    system,
    parts: [
      {
        type: "text",
        text: userContent,
      },
    ],
  });
}

/** Benchmark command: web-search for the standard benchmarks in this field. */
export async function findBenchmarks(field: string, method: string): Promise<string> {
  const system = `You are a research assistant. Given a paper's field and method, use web search to find the standard benchmark datasets, leaderboards, and baseline papers that this kind of work is normally evaluated against today. Return a concise Markdown list: for each benchmark, give its name, what it measures, and a link if you found one. Limit to the 5 most relevant, current benchmarks and prefer recent, widely-cited ones.`;

  return promptOpenCode({
    title: "paper-agent: benchmark",
    system,
    tools: { websearch: true },
    parts: [
      {
        type: "text",
        text: `Field: ${field}\nMethod: ${method}\n\nFind the standard benchmarks used to evaluate this kind of work.`,
      },
    ],
  });
}

/** Figures command: show every rendered page to OpenCode's vision and ask it to find + explain the methodology diagram. */
export async function findMethodologyFigure(images: PageImage[]): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paper-agent-figures-"));

  try {
    const parts: PromptPart[] = [
      {
        type: "text",
        text:
          "Here are the pages of a research paper, rendered as images, in order. Identify which page number contains the main methodology diagram, pipeline, or architecture figure — the visual that explains how the method works, not a results chart or a data table. Then give a clear, simple analysis of that figure: what it shows, the steps or components pictured, and how they connect.\n\n" +
          "Respond in exactly this format:\nPAGE: <page number>\nANALYSIS: <your analysis>\n\n" +
          "If the paper has no methodology diagram, respond with PAGE: none and a one-sentence reason.",
      },
    ];

    for (const image of images) {
      const filePath = path.join(tempDir, `page-${image.pageNumber}.png`);
      fs.writeFileSync(filePath, image.pngBuffer);
      parts.push({ type: "text", text: `Page ${image.pageNumber}:` });
      parts.push({
        type: "file",
        mime: "image/png",
        filename: path.basename(filePath),
        url: pathToFileURL(filePath).href,
      });
    }

    return await promptOpenCode({
      title: "paper-agent: figures",
      system: "You are a helpful research assistant.",
      parts,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Code command: decide if the method needs an implementation, and if so, generate a starter file. */
export async function generateImplementation(paperText: string, analysis: PaperAnalysis): Promise<string> {
  const system = `You are a senior ML/software engineer. Read the paper's method description and decide: does implementing this paper's core contribution require writing code (an algorithm, a machine-learning model or training procedure, a data-processing pipeline, a simulation, etc.)?

- If NO (e.g. the paper is a survey, a theoretical proof with no algorithmic component, a purely qualitative user study, or a policy analysis), respond with exactly one line:
NO_CODE_NEEDED: <one-sentence reason>

- If YES, respond with exactly this format:
LANGUAGE: <best-fit language, e.g. python>
FILENAME: <suggested file name with extension>
\`\`\`<language>
<a complete, runnable starter implementation of the core method, with comments, necessary imports, and a small example/__main__ usage block. Prefer widely-available libraries (numpy, pytorch, scikit-learn, etc.) over exotic or paper-specific ones. Do not fabricate numeric results — only implement the method.>
\`\`\``;

  return promptOpenCode({
    title: `paper-agent: code ${analysis.fileName}`,
    system,
    parts: [
      {
        type: "text",
        text: `Method summary: ${analysis.method}\n\nFull paper text for additional context:\n\n${paperText}`,
      },
    ],
  });
}
