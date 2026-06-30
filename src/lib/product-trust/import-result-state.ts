export interface ImportRowFailure {
  row: number;
  reason: string;
}

export interface ImportResult {
  importedRows: number;
  failedRows: ImportRowFailure[];
}

export type ImportViewState =
  | { state: 'imported'; importedRows: number }
  | { state: 'partial_failure'; importedRows: number; failedRows: ImportRowFailure[] }
  | { state: 'failed'; failedRows: ImportRowFailure[] };

export function mapImportResultState(result: ImportResult): ImportViewState {
  if (result.failedRows.length === 0) {
    return { state: 'imported', importedRows: result.importedRows };
  }
  if (result.importedRows === 0) {
    return { state: 'failed', failedRows: result.failedRows };
  }
  return {
    state: 'partial_failure',
    importedRows: result.importedRows,
    failedRows: result.failedRows,
  };
}
