import { RAGExtractor } from './ragExtractor.js';
import { config } from '../config/config.js';
class RAGExtractorService {
    constructor() {
        this.ragExtractor = null;
        this.isInitialized = false;
    }
    static getInstance() {
        if (!RAGExtractorService.instance) {
            RAGExtractorService.instance = new RAGExtractorService();
        }
        return RAGExtractorService.instance;
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            this.ragExtractor = new RAGExtractor();
            await this.ragExtractor.initialize();
            this.isInitialized = true;
        }
        catch (error) {
            console.error('Failed to initialize RAG extractor service:', error);
            this.ragExtractor = null;
            this.isInitialized = false;
            // Don't throw, let the application continue without AI features
        }
    }
    getExtractor() {
        return this.ragExtractor;
    }
    isEnabled() {
        return this.ragExtractor?.isAIEnabled() ?? false;
    }
    getAvailableProviders() {
        return this.ragExtractor?.getAvailableProviders() ?? [];
    }
    async extractTaxData(documentText, context = '') {
        if (!this.ragExtractor) {
            return this.getDefaultTaxData();
        }
        return this.ragExtractor.extractTaxData(documentText, context);
    }
    async testConnection() {
        if (!this.ragExtractor) {
            return {
                ollama: false,
                openai: false,
                claude: false
            };
        }
        return this.ragExtractor.testConnection();
    }
    async generateAnnualReport(extractedData) {
        if (!this.ragExtractor) {
            return this.getDefaultAnnualReport(extractedData);
        }
        return this.ragExtractor.generateAnnualReport(extractedData);
    }
    getDefaultAnnualReport(extractedData) {
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
    get preferredProvider() {
        return config.ai.preferredProvider;
    }
    getDefaultTaxData() {
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
