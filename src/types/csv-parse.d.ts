declare module 'csv-parse/sync' {
  export function parse(
    input: Buffer | string,
    options?: {
      skip_empty_lines?: boolean;
      trim?: boolean;
      [key: string]: any;
    }
  ): string[][];
} 