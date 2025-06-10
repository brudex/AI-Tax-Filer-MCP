export interface ExtractedTaxData {
  taxId?: string;
  taxpayerName?: string;
  totalIncome: number;
  totalExpenses: number;
  totalDeductions: number;
  taxableAmount: number;
  taxYear: number;
  businessType?: string;
  reportingPeriod?: {
    startDate: string;
    endDate: string;
  };
  incomeBreakdown?: {
    salaryIncome?: number;
    businessIncome?: number;
    investmentIncome?: number;
    otherIncome?: number;
  };
  expenseBreakdown?: {
    operationalExpenses?: number;
    capitalExpenses?: number;
    otherExpenses?: number;
  };
}

export interface DocumentInfo {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
  extractedData?: ExtractedTaxData;
}

export interface TaxReport {
  id: string;
  documentId: string;
  filename: string;
  filePath: string;
  taxData: ExtractedTaxData;
  generatedAt: Date;
  options: ReportGenerationOptions;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

export interface AIExtractionPrompt {
  systemMessage: string;
  userMessage: string;
}

export interface ReportGenerationOptions {
  includeCharts?: boolean;
  format?: 'pdf' | 'html';
  theme?: 'default' | 'gra-official';
} 