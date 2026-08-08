export interface PaperAnalysis {
  id: string;
  fileName: string;
  title?: string;
  field: string;
  method: string;
  result: string;
  impact: string;
  analyzedAt: string;
  pageCount: number;
}

/** Raw shape we ask OpenCode to return as JSON for a single-paper analysis. */
export interface RawAnalysisResponse {
  title?: string;
  field: string;
  method: string;
  result: string;
  impact: string;
}
