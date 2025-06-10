import { RAGExtractor } from './ragExtractor.js';
import { ExtractedTaxData } from '../types/index.js';
import { config } from '../config/config.js';

class RAGExtractorService {
  private static instance: RAGExtractorService;
  private ragExtractor: RAGExtractor | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): RAGExtractorService {
    if (!RAGExtractorService.instance) {
      RAGExtractorService.instance = new RAGExtractorService();
    }
    return RAGExtractorService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.ragExtractor = new RAGExtractor();
      await this.ragExtractor.initialize();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize RAG extractor service:', error);
      this.ragExtractor = null;
      this.isInitialized = false;
      // Don't throw, let the application continue without AI features
    }
  }

  public getExtractor(): RAGExtractor | null {
    return this.ragExtractor;
  }

  public isEnabled(): boolean {
    return this.ragExtractor?.isAIEnabled() ?? false;
  }

  public getAvailableProviders(): string[] {
    return this.ragExtractor?.getAvailableProviders() ?? [];
  }

  public async extractTaxData(documentText: string, context: string = ''): Promise<ExtractedTaxData> {
    if (!this.ragExtractor) {
      return this.getDefaultTaxData();
    }
    return this.ragExtractor.extractTaxData(documentText, context);
  }

  public async testConnection(): Promise<Record<string, boolean>> {
    if (!this.ragExtractor) {
      return {
        ollama: false,
        openai: false,
        claude: false
      };
    }
    return this.ragExtractor.testConnection();
  }

  public async generateAnnualReport(extractedData: ExtractedTaxData): Promise<string> {
    if (!this.ragExtractor) {
      return this.getDefaultAnnualReport(extractedData);
    }
    return this.ragExtractor.generateAnnualReport(extractedData);
  }

  private getDefaultAnnualReport(extractedData: ExtractedTaxData): string {
    const profitMargin = extractedData.totalIncome > 0 
      ? ((extractedData.totalIncome - extractedData.totalExpenses) / extractedData.totalIncome * 100).toFixed(2)
      : '0.00';

    return `
# ANNUAL FINANCIAL REPORT
## ${extractedData.taxpayerName}
### Tax Year: ${extractedData.taxYear}

---

## EXECUTIVE SUMMARY

This annual financial report provides an overview of ${extractedData.taxpayerName}'s financial performance for the tax year ${extractedData.taxYear}. The company, operating in the ${extractedData.businessType} sector, has reported the following key financial metrics.

## FINANCIAL PERFORMANCE

**Revenue & Income:**
- Total Income: $${extractedData.totalIncome.toLocaleString()}

**Expenses & Costs:**
- Total Expenses: $${extractedData.totalExpenses.toLocaleString()}

**Profitability:**
- Gross Profit: $${(extractedData.totalIncome - extractedData.totalExpenses).toLocaleString()}
- Profit Margin: ${profitMargin}%

## TAX POSITION

**Tax Assessment:**
- Total Deductions: $${extractedData.totalDeductions.toLocaleString()}
- Taxable Amount: $${extractedData.taxableAmount.toLocaleString()}
- Tax ID: ${extractedData.taxId}

## CONCLUSION

Based on the extracted financial data, ${extractedData.taxpayerName} shows ${extractedData.taxableAmount > 0 ? 'profitable' : 'loss-making'} operations for the tax year ${extractedData.taxYear}. Further detailed analysis is recommended for comprehensive business insights.

---
*Report generated automatically from extracted tax data. For detailed analysis, please consult with a financial advisor.*
    `;
  }

  public get preferredProvider(): string {
    return config.ai.preferredProvider;
  }

  private getDefaultTaxData(): ExtractedTaxData {
    return {
      taxpayerName: 'Please enter manually',
      taxYear: new Date().getFullYear(),
      totalIncome: 0,
      totalExpenses: 0,
      totalDeductions: 0,
      taxableAmount: 0,
      taxId: 'Please enter manually',
      businessType: 'Please specify'
    };
  }
}

export const ragExtractorService = RAGExtractorService.getInstance(); 