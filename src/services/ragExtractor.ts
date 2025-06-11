import { config } from '../config/config.js';
import { ExtractedTaxData } from '../types/index.js';
import { Ollama } from '@langchain/community/llms/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { Document } from '@langchain/core/documents';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Utility Types
interface FinancialStatementItem {
  Account: string;
  Amount?: number;
  Expenses?: number;
  Cost?: number;
  Balance?: number;
  Retained_Earnings?: number;
  Tax_Paid?: number;
  Tax_Year?: number;
  Tax_ID?: string;
  Business_Type?: string;
  Taxpayer_Name?: string;
  Total_Income?: number;
  Total_Expenses?: number;
}

interface FinancialStatementData {
  Balance_Sheet?: FinancialStatementItem[];
  Profit_and_Loss?: FinancialStatementItem[];
  Retained_Earnings?: FinancialStatementItem[];
  companyName?: string;
  statementDate?: string;
  totalIncome?: number;
  totalExpenses?: number;
  totalDeductions?: number;
  taxableAmount?: number;
  taxId?: string;
  businessType?: string;
}

interface ValidationData {
  revenue?: number;
  profitBeforeTax?: number;
  netProfitAfterTax?: number;
  retainedEarnings?: number;
  costOfSales?: number;
  operatingExpenses?: number;
}

interface EnhancedExtractedTaxData extends ExtractedTaxData {
  validationData?: ValidationData;
}

// Utility Functions
const cleanJSONString = (content: string): string => {
  try {
    let cleaned = content.trim();
    
    // If content doesn't start with {, find the first {
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace > 0) {
      cleaned = cleaned.slice(firstBrace);
    }
    
    // If content doesn't end with }, find the last }
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1 && lastBrace < cleaned.length - 1) {
      cleaned = cleaned.slice(0, lastBrace + 1);
    }

    // Remove markdown code blocks
    cleaned = cleaned.replace(/```(?:json)?\s*|\s*```/g, '');
    
    // Remove comments (both // and /* */)
    cleaned = cleaned.replace(/\/\/[^\n]*/g, ''); // Remove single line comments
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments
    
    // Fix common JSON formatting issues
    cleaned = cleaned
      // Remove trailing commas in objects and arrays
      .replace(/,(\s*[}\]])/g, '$1')
      // Ensure property names are double-quoted
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
      // Fix missing quotes around string values
      .replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*([,}])/g, ':"$1"$2')
      // Remove any remaining newlines and extra spaces
      .replace(/\s+/g, ' ')
      .trim();

    // Validate JSON structure
    if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) {
      throw new Error('Invalid JSON structure');
    }

    return cleaned;
  } catch (error) {
    console.warn('Error in cleanJSONString:', error);
    throw error;
  }
};

const safeJSONParse = (content: string): any => {
  try {
    // First try direct parsing
    return JSON.parse(content);
  } catch (error) {
    console.warn('Initial JSON parse failed, attempting cleanup...');
    
    try {
      // Try parsing after cleaning
      const cleaned = cleanJSONString(content);
      return JSON.parse(cleaned);
    } catch (error) {
      console.warn('Cleaned JSON parse failed, attempting rescue parsing...');
      
      try {
        // Last resort: aggressive cleaning
        let rescued = content
          .replace(/[^\x20-\x7E]/g, '') // Remove non-printable characters
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
          .replace(/([a-zA-Z0-9_]+):/g, '"$1":') // Quote unquoted keys
          .replace(/:\s*'([^']*?)'\s*([,}])/g, ':"$1"$2') // Replace single quotes with double quotes
          .replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*([,}])/g, ':"$1"$2'); // Quote unquoted string values
        
        // Extract JSON object if embedded in other text
        const match = rescued.match(/{[\s\S]*}/);
        if (match) {
          rescued = match[0];
        }
        
        return JSON.parse(rescued);
      } catch (finalError) {
        console.error('All JSON parsing attempts failed:', finalError);
        throw new Error('Failed to parse JSON after multiple attempts');
      }
    }
  }
};

const parseAmount = (match: RegExpMatchArray | null): number => {
  if (!match || !match[1]) return 0;
  const numStr = match[1].replace(/,/g, '');
  if (numStr.includes('(') && numStr.includes(')')) {
    return -parseFloat(numStr.replace(/[()]/g, ''));
  }
  return parseFloat(numStr);
};

const extractYearFromText = (text: string): number => {
  const yearMatch = text.match(/(?:20\d{2})/);
  return yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();
};

const extractCompanyInfo = (text: string): { name: string; type: string } => {
  let name = "Not provided";
  let type = "Not provided";

  const lines = text.split('\n');
  
  // Look for company name patterns
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && /\b\w+.*LIMITED\b/i.test(trimmedLine)) {
      name = trimmedLine;
      const words = trimmedLine.split(' ');
      const limitedIndex = words.findIndex(w => /LIMITED/i.test(w));
      if (limitedIndex > 0) {
        type = words.slice(0, limitedIndex).join(' ').trim();
      }
      break;
    }
  }

  // Try alternative patterns if needed
  if (name === "Not provided") {
    const companyPattern = /^([A-Z][A-Z\s&]+(?:COMPANY|LIMITED|LTD|INC|CORP))/m;
    const match = text.match(companyPattern);
    if (match) {
      name = match[1].trim();
      if (/TECHNOLOGY|TECH|SOFTWARE|IT/i.test(name)) {
        type = "Technology";
      } else if (/TRADING|TRADE/i.test(name)) {
        type = "Trading";
      } else if (/CONSTRUCTION|BUILD/i.test(name)) {
        type = "Construction";
      }
    }
  }

  return { name, type };
};

const getDefaultTaxData = (): ExtractedTaxData => ({
  taxpayerName: 'Not provided',
  taxYear: new Date().getFullYear(),
  totalIncome: 0,
  totalExpenses: 0,
  totalDeductions: 0,
  taxableAmount: 0,
  taxId: 'Not provided',
  businessType: 'Not specified'
});

const validateNumericValue = (value: any): number => {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return 0;
  }
  return value;
};

const validateExpensesRatio = (expenses: number, income: number): number => {
  const MAX_EXPENSE_RATIO = 5; // 500% of revenue
  if (income > 0 && expenses > income * 3) {
    return Math.min(expenses, income * MAX_EXPENSE_RATIO);
  }
  return expenses;
};

const validateTaxableAmount = (
  taxableAmount: number,
  calculatedTaxable: number,
  totalIncome: number
): { 
  value: number;
  warning?: string;
} => {
  const taxableDifference = Math.abs(calculatedTaxable - taxableAmount);
  const significantDifference = Math.max(1000, totalIncome * 0.1);
  
  if (taxableDifference > significantDifference) {
    if (taxableAmount === 0 && calculatedTaxable !== 0) {
      return {
        value: calculatedTaxable,
        warning: `Taxable amount corrected to calculated value: ${calculatedTaxable}`
      };
    }
    return {
      value: taxableAmount,
      warning: 'Taxable amount differs significantly from calculated value'
    };
  }
  
  return { value: taxableAmount };
};

export class RAGExtractor {
  private llm: Ollama | null = null;
  private openai: OpenAI | null = null;
  private claude: Anthropic | null = null;
  private vectorStore: MemoryVectorStore | null = null;
  private embeddings: OllamaEmbeddings | null = null;
  private availableProviders: string[] = [];
  private preferredProvider: string;

  constructor() {
    this.preferredProvider = config.ai.preferredProvider;
  }

  /**
   * Initialize all AI providers with enhanced error handling
   */
  async initialize(): Promise<void> {
    try {
      await Promise.all([
        this.initializeOllama(),
        this.initializeOpenAI(),
        this.initializeClaude()
      ]);

      if (this.availableProviders.length === 0) {
        console.warn('⚠️  No AI providers available. AI extraction will be disabled.');
      } else {
        console.log(`🤖 Available AI providers: ${this.availableProviders.join(', ')}`);
      }
    } catch (error) {
      console.error('Failed to initialize AI providers:', error);
      // Don't throw, just log the error and continue with disabled providers
    }
  }

  /**
   * Initialize Ollama provider and embeddings
   */
  private async initializeOllama(): Promise<void> {
    if (!config.ai.ollama.enabled) return;

    try {
      // Initialize Ollama embeddings
      const embeddingsInstance = await this.initializeOllamaEmbeddings();
      if (embeddingsInstance) {
        this.embeddings = embeddingsInstance;
        this.vectorStore = new MemoryVectorStore(this.embeddings);
        console.log('✅ Ollama embeddings initialized successfully');
      }

      // Initialize Ollama LLM
      const llmInstance = await this.initializeOllamaLLM();
      if (llmInstance) {
        this.llm = llmInstance;
        this.availableProviders.push('ollama');
        console.log('✅ Ollama LLM initialized successfully');
      }
    } catch (error) {
      console.warn('⚠️  Failed to initialize Ollama:', error);
      this.cleanupOllamaResources();
    }
  }

  /**
   * Initialize Ollama embeddings with timeout
   */
  private async initializeOllamaEmbeddings(): Promise<OllamaEmbeddings | null> {
    try {
      const embeddingsInstance = new OllamaEmbeddings({
        model: config.ai.ollama.model,
        baseUrl: config.ai.ollama.baseUrl
      });

      // Test embeddings with timeout
      const embeddingsPromise = embeddingsInstance.embedQuery("Test embeddings");
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Ollama embeddings timeout')), 5000);
      });

      await Promise.race([embeddingsPromise, timeoutPromise]);
      return embeddingsInstance;
    } catch (error) {
      console.warn('⚠️  Failed to initialize Ollama embeddings:', error);
      console.warn('   Is Ollama running? Try starting it with: ollama serve');
      return null;
    }
  }

  /**
   * Initialize Ollama LLM with timeout
   */
  private async initializeOllamaLLM(): Promise<Ollama | null> {
    try {
      console.log('🔄 Creating Ollama LLM instance...');
      const llmInstance = new Ollama({
        baseUrl: config.ai.ollama.baseUrl,
        model: config.ai.ollama.model,
        temperature: 0.1
      });

      // Test LLM with timeout
      console.log('🔄 Testing Ollama LLM connection...');
      const testPromise = llmInstance.invoke("Test connection");
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Ollama LLM timeout')), 15000);
      });

      const testResponse = await Promise.race([testPromise, timeoutPromise]);
      console.log('🔄 Ollama LLM test response:', testResponse);

      return testResponse ? llmInstance : null;
    } catch (error) {
      console.warn('⚠️  Failed to initialize Ollama LLM:', error);
      console.warn('   Is Ollama running? Try starting it with: ollama serve');
      if (error instanceof Error && error.stack) {
        console.warn('   Stack trace:', error.stack);
      }
      return null;
    }
  }

  /**
   * Clean up Ollama resources on failure
   */
  private cleanupOllamaResources(): void {
    this.llm = null;
    this.embeddings = null;
    this.vectorStore = null;
  }

  /**
   * Initialize OpenAI provider
   */
  private async initializeOpenAI(): Promise<void> {
    if (!config.ai.openai.enabled || !config.ai.openai.apiKey) return;

    try {
      this.openai = new OpenAI({
        apiKey: config.ai.openai.apiKey,
      });
      
      // Test connection
      const response = await this.openai.chat.completions.create({
        model: config.ai.openai.model,
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 50
      });

      if (response) {
        this.availableProviders.push('openai');
        console.log('✅ OpenAI initialized successfully');
      }
    } catch (error) {
      console.warn('⚠️  Failed to initialize OpenAI:', error);
      this.openai = null;
    }
  }

  /**
   * Initialize Claude provider
   */
  private async initializeClaude(): Promise<void> {
    if (!config.ai.claude.enabled || !config.ai.claude.apiKey) return;

    try {
      this.claude = new Anthropic({
        apiKey: config.ai.claude.apiKey,
      });

      // Test connection
      const response = await this.claude.messages.create({
        model: config.ai.claude.model,
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: 'Test connection'
          }
        ]
      });

      if (response) {
        this.availableProviders.push('claude');
        console.log('✅ Claude initialized successfully');
      }
    } catch (error) {
      console.warn('⚠️  Failed to initialize Claude:', error);
      this.claude = null;
    }
  }

  /**
   * Get providers to try based on preference
   */
  private getProvidersToTry(): string[] {
    if (this.availableProviders.includes(this.preferredProvider)) {
      return [
        this.preferredProvider,
        ...this.availableProviders.filter(p => p !== this.preferredProvider)
      ];
    }
    return this.availableProviders;
  }

  /**
   * Check if AI extraction is enabled
   */
  isAIEnabled(): boolean {
    return this.availableProviders.length > 0;
  }

  /**
   * Get available AI providers
   */
  getAvailableProviders(): string[] {
    return this.availableProviders;
  }

  /**
   * Test AI provider connections
   */
  async testConnection(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {
      ollama: false,
      openai: false,
      claude: false
    };

    // Test Ollama
    if (this.llm) {
      try {
        const response = await this.llm.invoke("Test connection");
        results.ollama = !!response;
      } catch (error) {
        console.warn('Ollama test failed:', error);
      }
    }

    // Test OpenAI
    if (this.openai) {
      try {
        const response = await this.openai.chat.completions.create({
          model: config.ai.openai.model,
          messages: [{ role: 'user', content: 'Test connection' }],
          max_tokens: 50
        });
        results.openai = !!response;
      } catch (error) {
        console.warn('OpenAI test failed:', error);
      }
    }

    // Test Claude
    if (this.claude) {
      try {
        const response = await this.claude.messages.create({
          model: config.ai.claude.model,
          max_tokens: 50,
          messages: [
            {
              role: 'user',
              content: 'Test connection'
            }
          ]
        });
        results.claude = !!response;
      } catch (error) {
        console.warn('Claude test failed:', error);
      }
    }

    return results;
  }

  /**
   * Extract tax data using available providers
   */
  async extractTaxData(documentText: string, context: string = ''): Promise<ExtractedTaxData> {
    if (this.availableProviders.length === 0) {
      return this.getDefaultTaxData();
    }

    // Store document in vector store for RAG if available
    if (this.vectorStore && this.embeddings) {
      try {
      await this.vectorStore.addDocuments([
        new Document({
          pageContent: documentText,
            metadata: { timestamp: Date.now(), context }
        })
      ]);
      } catch (error) {
        console.warn('Failed to store document in vector store:', error);
        // Continue without vector store functionality
      }
    }

    // Try providers in order of preference
    const providersToTry = this.getProvidersToTry();
    
    for (const provider of providersToTry) {
      try {
        const result = await this.extractWithProvider(provider, documentText, context);
        return result;
      } catch (error) {
        console.warn(`❌ ${provider} extraction failed:`, error);
      }
    }

    return this.getDefaultTaxData();
  }

  /**
   * Extract data using a specific provider
   */
  private async extractWithProvider(
    provider: string,
    documentText: string,
    context: string
  ): Promise<ExtractedTaxData> {
    const prompt = this.buildExtractionPrompt(documentText, context);

    switch (provider) {
      case 'ollama':
        return this.extractWithOllama(prompt, documentText);
      case 'openai':
        return this.extractWithOpenAI(prompt, documentText);
      case 'claude':
        return this.extractWithClaude(prompt, documentText);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Extract using Ollama
   */
  private async extractWithOllama(prompt: string, originalDocumentText: string): Promise<ExtractedTaxData> {
    if (!this.llm) throw new Error('Ollama not initialized');
    
    const response = await this.llm.invoke(prompt);

    console.log('ollama prompt:>>>>>>>>>>>>', prompt);
    console.log('ollama response:>>>>>>>>>>>>', response);

    return this.parseAIResponse(response, originalDocumentText);
  }

  /**
   * Extract using OpenAI
   */
  private async extractWithOpenAI(prompt: string, originalDocumentText: string): Promise<ExtractedTaxData> {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const response = await this.openai.chat.completions.create({
      model: config.ai.openai.model,
      messages: [
        { role: 'system', content: 'You are a tax document processing assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    return this.parseAIResponse(response.choices[0]?.message?.content || '', originalDocumentText);
  }

  /**
   * Extract using Claude
   */
  private async extractWithClaude(prompt: string, originalDocumentText: string): Promise<ExtractedTaxData> {
    if (!this.claude) throw new Error('Claude not initialized');

    try {
      const response = await this.claude.messages.create({
        model: config.ai.claude.model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('Empty response from Claude');
      }

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      if (!content) {
        throw new Error('No text content in Claude response');
      }

      return this.parseAIResponse(content, originalDocumentText);
    } catch (error) {
      console.error('Claude extraction failed:', error); 
      throw error;
    }
  }

  /**
   * Build extraction prompt with enhanced field detection
   */
  private buildExtractionPrompt(documentText: string, context: string): string {
    return `
      You are a Ghana tax document analysis expert. Extract ALL financial data from this statement.
      Return ONLY a valid JSON object with the extracted values, no explanations or formatting.

      CRITICAL JSON RULES:
      - NO COMMENTS in JSON (no // or /* */ comments)
      - NO explanations or descriptions in the JSON
      - ONLY valid JSON syntax
      - Numbers as numbers, not strings

      CURRENCY HANDLING:
      - All amounts are in Ghana Cedis (GH¢)
      - Remove GH¢ symbols and convert to numbers
      - Parentheses indicate NEGATIVE amounts: (1,680) = -1680
      - Comma thousands separators should be removed

      CRITICAL EXTRACTION REQUIREMENTS:
      Extract EVERY financial figure you can find. Look for ALL of these items:

      1. INCOME STATEMENT ITEMS:
         - Revenue/Sales/Turnover (exact amount from P&L)
       - Other income (if any)
       - Cost of sales/Cost of goods sold
       - Gross profit
       - Operating expenses (detailed breakdown if available)
       - General & administrative expenses
       - Depreciation expenses
       - Interest expenses
       - Profit/Loss before tax (CRITICAL - preserve sign)
       - Income tax expense (split into current and deferred where possible)
       - Net profit/loss after tax
       - Total comprehensive income

      2. BALANCE SHEET ITEMS:
          - Property, plant & equipment (net book value)
       - Trade receivables
       - Cash and bank balances
       - Stated capital/Share capital
       - Retained earnings
       - Trade payables/creditors
       - Accruals
       - Deferred tax assets and liabilities
       - Current tax assets/liabilities
       - Total current assets
       - Total non-current assets
       - Total assets
       - Total current liabilities
       - Total non-current liabilities
       - Total liabilities
       - Total equity

      3. TAX COMPUTATION ITEMS:
         - Assessable income
         - Capital allowances
         - Chargeable income
         - Tax thereon
         - Deferred tax assets/liabilities

      4. GHANA-SPECIFIC TAX ITEMS:
         - PAYE deducted from employees
         - Withholding tax deducted
         - VAT input/output tax
         - Social Security (SSNIT) contributions
         - NHIS contributions
         - GETFund levy (2.5% of chargeable income)
         - National Reconstruction Levy
         - Communication Service Tax
         - Stamp duty on documents
         - Customs/Import duties
         - Excise duty
         - Property tax
         - Vehicle tax
         - Business operating permit fees
         - Environmental excise tax
         - Energy sector levies
         - Stabilisation levy

      SPECIFIC FIELD MAPPING:
      - taxpayerName: Extract company name from document header
      - taxYear: Look for "year ended" date
      - totalIncome: Primary revenue figure (NOT calculated)
      - totalExpenses: Sum all expense items
      - totalDeductions: Capital allowances + depreciation + other deductions
      - taxableAmount: Use "Profit before tax" or "Chargeable income"

      NEGATIVE NUMBER HANDLING:
      - (1,680) means -1680
      - Loss before tax should be negative
      - Expenses shown in parentheses are still positive expenses

      REQUIRED JSON FORMAT:
      - FLAT JSON object (no nested objects or arrays)
      - If data not found, use 0 for numbers, "Not provided" for strings
      - Each amount as a number (no quotes)

      EXTRACTION RULES:
      1. Find EXACT amounts from the document — do NOT calculate or estimate.
      2. Extract subtotals and totals if explicitly stated (even if they're a sum of other figures).
      3. Preserve negative signs for losses (parentheses = negative).
      4. Revenue MUST be extracted correctly — look for "Revenue", "Sales", or "Turnover" in the Income Statement.
      5. Handle Ghana Cedis currency properly — remove GH¢ symbols and commas.
      6. Convert ALL amounts to numbers, not strings.
      7. If a specific item is not found, use 0 for numbers, "Not provided" for strings.
      8. Use a FLAT JSON structure — NO nested objects or arrays; each item as its own key-value pair.
      9. If you are not sure about the data, use 0 for numbers, "Not provided" for strings.

      Additional context: ${context}

      Document text:
      ${documentText}

      Return the complete JSON object with ALL extracted financial data:
    `;
  }

  /**
   * Extract company details from document text
   */
  private extractCompanyDetails(documentText: string): { companyName: string; businessType: string } {
    // Default values
    let companyName = "Not provided";
    let businessType = "Not provided";

    try {
      // Try to find the company name using various patterns
      const lines = documentText.split('\n');
      
      // Pattern 1: Look for "COMPANY LIMITED" format
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && /\b\w+.*LIMITED\b/i.test(trimmedLine)) {
          companyName = trimmedLine;
          // Extract business type from company name
          const words = trimmedLine.split(' ');
          const limitedIndex = words.findIndex(w => /LIMITED/i.test(w));
          if (limitedIndex > 0) {
            businessType = words.slice(0, limitedIndex).join(' ').trim();
          }
          break;
        }
      }
      
      // Pattern 2: Look for company name in specific financial statement patterns
      if (companyName === "Not provided") {
        const companyPattern = /^([A-Z][A-Z\s&]+(?:COMPANY|LIMITED|LTD|INC|CORP))/m;
        const match = documentText.match(companyPattern);
        if (match) {
          companyName = match[1].trim();
          // Infer business type from name
          if (/TECHNOLOGY|TECH|SOFTWARE|IT/i.test(companyName)) {
            businessType = "Technology";
          } else if (/TRADING|TRADE/i.test(companyName)) {
            businessType = "Trading";
          } else if (/CONSTRUCTION|BUILD/i.test(companyName)) {
            businessType = "Construction";
          }
        }
      }
      
      // Pattern 3: Look for common financial statement headers
      if (companyName === "Not provided") {
        const headerPatterns = [
          /Statement\s+of.*for\s+(.+)/i,
          /Financial\s+Statements.*of\s+(.+)/i,
          /(.+)\s+Financial\s+Statements/i
        ];
        
        for (const pattern of headerPatterns) {
          const match = documentText.match(pattern);
          if (match && match[1]) {
            const extracted = match[1].trim();
            if (extracted.length > 3 && extracted.length < 100) {
              companyName = extracted;
              break;
            }
          }
        }
      }
      
    } catch (error) {
      console.warn('Failed to extract company details:', error);
    }

    return { companyName, businessType };
  }

  /**
   * Extract tax year from document text
   */
  private extractTaxYear(documentText: string): number {
    try {
      // Look for year in common date formats
      const yearMatch = documentText.match(/(?:20\d{2})/);
      if (yearMatch) {
        return parseInt(yearMatch[0], 10);
      }

      // If no year found, use current year
      return new Date().getFullYear();
    } catch (error) {
      console.warn('Failed to extract tax year:', error);
      return new Date().getFullYear();
    }
  }

  /**
   * Extract tax-specific amounts from document text
   */
  private extractTaxAmounts(content: string): { 
    totalIncome: number; 
    totalExpenses: number; 
    totalDeductions: number;
    taxableAmount: number;
  } {
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalDeductions = 0;
    let taxableAmount = 0;

    try {
      // Helper function to parse numbers from text
      const parseAmount = (match: RegExpMatchArray | null): number => {
        if (!match || !match[1]) return 0;
        // Handle negative numbers and remove commas
        const numStr = match[1].replace(/,/g, '');
        if (numStr.includes('(') && numStr.includes(')')) {
          // Handle parentheses notation for negative numbers
          return -parseFloat(numStr.replace(/[()]/g, ''));
        }
        return parseFloat(numStr);
      };

      // Look for revenue/income
      const revenueMatch = content.match(/Revenue[^\d]+([-\d,()]+)/i);
      const otherIncomeMatch = content.match(/Other\s+income[^\d]+([-\d,()]+)/i);
      totalIncome = parseAmount(revenueMatch) + parseAmount(otherIncomeMatch);

      // Look for expenses
      const expensesMatches = [
        content.match(/(?:General|Administrative|Operating)\s+expenses?[^\d]+([-\d,()]+)/i),
        content.match(/Cost\s+of\s+sales[^\d]+([-\d,()]+)/i),
        content.match(/Direct\s+expenses?[^\d]+([-\d,()]+)/i)
      ];
      totalExpenses = expensesMatches.reduce((sum, match) => sum + parseAmount(match), 0);

      // Look for deductions
      const deductionMatches = [
        content.match(/Capital\s+allowances?[^\d]+([-\d,()]+)/i),
        content.match(/Depreciation[^\d]+([-\d,()]+)/i),
        content.match(/Tax\s+relief[^\d]+([-\d,()]+)/i),
        content.match(/Allowable\s+deductions?[^\d]+([-\d,()]+)/i)
      ];
      totalDeductions = deductionMatches.reduce((sum, match) => sum + parseAmount(match), 0);

      // Look for profit/loss before tax
      const profitMatch = content.match(/Profit\s+before\s+tax[^\d]+([-\d,()]+)/i);
      taxableAmount = parseAmount(profitMatch);

      // If taxable amount is not found, calculate it
      if (taxableAmount === 0) {
        taxableAmount = totalIncome - totalExpenses - totalDeductions;
      }
    } catch (parseError) {
      console.warn('Failed to parse numbers from text:', parseError);
    }

    return {
      totalIncome,
      totalExpenses,
      totalDeductions,
      taxableAmount
    };
  }

  /**
   * Validate and cross-verify extracted financial data
   */
  private validateExtractedData(data: EnhancedExtractedTaxData): ExtractedTaxData {
    const validationData = data.validationData;
    let validatedData = { ...data };

    if (validationData) {
      // Cross-verification checks
      const validationResults = this.performCrossValidation(validationData, data);
      
      // Apply corrections based on validation
      if (validationResults.correctedRevenue !== null) {
        validatedData.totalIncome = validationResults.correctedRevenue;
      }
      
      if (validationResults.correctedProfitBeforeTax !== null) {
        validatedData.taxableAmount = validationResults.correctedProfitBeforeTax;
      }

      // Log validation insights
      if (validationResults.warnings.length > 0) {
        console.warn('🔍 Data validation warnings:');
        validationResults.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }

      if (validationResults.corrections.length > 0) {
        console.log('✅ Data corrections applied:');
        validationResults.corrections.forEach(correction => console.log(`  - ${correction}`));
      }
    }

    // Apply soft constraints
    validatedData = this.applySoftConstraints(validatedData);

    // Remove validation data from final output
    delete validatedData.validationData;
    
    return validatedData as ExtractedTaxData;
  }

  /**
   * Perform cross-validation of financial data
   */
  private performCrossValidation(validation: ValidationData, data: ExtractedTaxData): {
    correctedRevenue: number | null;
    correctedProfitBeforeTax: number | null;
    warnings: string[];
    corrections: string[];
  } {
    const warnings: string[] = [];
    const corrections: string[] = [];
    let correctedRevenue: number | null = null;
    let correctedProfitBeforeTax: number | null = null;

    // 1. Revenue validation
    if (validation.revenue && validation.revenue !== data.totalIncome) {
      if (validation.revenue > 0 && (data.totalIncome === 0 || Math.abs(validation.revenue - data.totalIncome) / validation.revenue > 0.1)) {
        correctedRevenue = validation.revenue;
        corrections.push(`Revenue corrected from ${data.totalIncome} to ${validation.revenue}`);
      }
    }

    // 2. Profit Before Tax validation
    if (validation.profitBeforeTax && validation.profitBeforeTax !== data.taxableAmount) {
      if (Math.abs(validation.profitBeforeTax - data.taxableAmount) > 100) { // Allow small rounding differences
        correctedProfitBeforeTax = validation.profitBeforeTax;
        corrections.push(`Profit Before Tax corrected from ${data.taxableAmount} to ${validation.profitBeforeTax}`);
      }
    }

    // 3. Mathematical consistency checks
    const revenue = correctedRevenue || data.totalIncome;
    const profitBeforeTax = correctedProfitBeforeTax || data.taxableAmount;

    // Check: Revenue - Total Expenses ≈ Gross Profit
    if (revenue > 0 && data.totalExpenses > 0) {
      const grossProfit = revenue - data.totalExpenses;
      if (validation.costOfSales) {
        const expectedGrossProfit = revenue - validation.costOfSales;
        if (Math.abs(grossProfit - expectedGrossProfit) / revenue > 0.2) {
          warnings.push(`Gross profit calculation may be inconsistent. Check cost of sales.`);
        }
      }
    }

    // 4. Retained earnings consistency
    if (validation.retainedEarnings && validation.netProfitAfterTax) {
      // Simplified check: If retained earnings changed significantly, there should be corresponding net profit
      if (validation.retainedEarnings > 0 && validation.netProfitAfterTax <= 0) {
        warnings.push(`Retained earnings positive but net profit is not positive - check for dividends or prior year adjustments`);
      }
    }

    // 5. Profit before tax vs after tax relationship
    if (validation.profitBeforeTax && validation.netProfitAfterTax) {
      const taxAmount = validation.profitBeforeTax - validation.netProfitAfterTax;
      if (taxAmount < 0) {
        warnings.push(`Net profit after tax exceeds profit before tax - this may indicate tax credits or errors`);
      } else if (validation.profitBeforeTax > 0 && taxAmount / validation.profitBeforeTax > 0.5) {
        warnings.push(`Tax rate appears unusually high (${(taxAmount / validation.profitBeforeTax * 100).toFixed(1)}%)`);
      }
    }

    return {
      correctedRevenue,
      correctedProfitBeforeTax,
      warnings,
      corrections
    };
  }

  /**
   * Apply soft constraints with enhanced validation
   */
  private applySoftConstraints(data: ExtractedTaxData): ExtractedTaxData {
    const constrainedData = { ...data };
    const warnings: string[] = [];

    // Validate numeric fields
    const numericFields: (keyof ExtractedTaxData)[] = [
      'totalIncome',
      'totalExpenses',
      'totalDeductions',
      'taxableAmount'
    ];

    for (const field of numericFields) {
      const originalValue = constrainedData[field] as number;
      const validatedValue = validateNumericValue(originalValue);
      if (validatedValue !== originalValue) {
        warnings.push(`Invalid numeric value for ${field}, reset to 0`);
        (constrainedData[field] as number) = validatedValue;
      }
    }

    // Validate revenue
    if (constrainedData.totalIncome <= 0 && constrainedData.businessType !== 'Holding Company') {
      warnings.push('Revenue is zero or negative for operational company');
    }

    // Validate and adjust expenses if needed
    const validatedExpenses = validateExpensesRatio(
      constrainedData.totalExpenses,
      constrainedData.totalIncome
    );
    
    if (validatedExpenses !== constrainedData.totalExpenses) {
      warnings.push('Expenses were capped at maximum allowed ratio to revenue');
      constrainedData.totalExpenses = validatedExpenses;
    }

    // Validate taxable amount
    const calculatedTaxable = constrainedData.totalIncome - 
                            constrainedData.totalExpenses - 
                            constrainedData.totalDeductions;
    
    const { value: validatedTaxable, warning: taxableWarning } = validateTaxableAmount(
      constrainedData.taxableAmount,
      calculatedTaxable,
      constrainedData.totalIncome
    );

    if (taxableWarning) {
      warnings.push(taxableWarning);
      constrainedData.taxableAmount = validatedTaxable;
    }

    // Log all warnings
    if (warnings.length > 0) {
      console.warn('⚠️  Validation warnings:');
      warnings.forEach(warning => console.warn(`  - ${warning}`));
    }

    return constrainedData;
  }

  /**
   * Check if the response is a simplified format (like {"Revenue": 1680, "ProfitBeforeTax": 1680})
   */
  private isSimplifiedResponse(data: any): boolean {
    const keys = Object.keys(data);
    const simplifiedKeys = ['Revenue', 'ProfitBeforeTax', 'Expenses', 'Income', 'Sales', 'Turnover'];
    return keys.some(key => simplifiedKeys.includes(key)) && 
           !('taxpayerName' in data) && 
           !('Balance_Sheet' in data) && 
           !('Profit_and_Loss' in data);
  }

  /**
   * Parse simplified AI response format
   */
  private parseSimplifiedResponse(data: any, originalDocumentText: string): ExtractedTaxData {
    console.log('📋 Parsing simplified response format...1');
    console.log('data:>>>>>>>>>>>>', data);

    
    // Extract company details and tax year from document text
    const { companyName, businessType } = this.extractCompanyDetails(originalDocumentText);
    const taxYear = this.extractTaxYear(originalDocumentText);
    
    // Map simplified keys to our standard format
    const revenue = data.Revenue || data.Income || data.Sales || data.Turnover || 
                   this.extractAmountFromText(originalDocumentText, /revenue|sales|turnover/i);
    
    const expenses = data.Expenses || data.TotalExpenses || 
                    this.extractAmountFromText(originalDocumentText, /expenses|costs/i);
    
    const profitBeforeTax = data.ProfitBeforeTax || data.Profit_Before_Tax || 
                           this.extractAmountFromText(originalDocumentText, /profit.*before.*tax/i);
    
    const deductions = data.Deductions || data.CapitalAllowances || 
                      this.extractAmountFromText(originalDocumentText, /capital.*allowances?|deductions?/i);

    console.log('📊 Simplified extraction results:', {
      revenue,
      expenses,
      profitBeforeTax,
      deductions
    });

    const extractedData: ExtractedTaxData = {
      taxpayerName: companyName,
      taxYear: taxYear,
      totalIncome: revenue,
      totalExpenses: expenses,
      totalDeductions: deductions,
      taxableAmount: profitBeforeTax || (revenue - expenses - deductions),
      taxId: "Not provided",
      businessType: businessType
    };

    return this.applySoftConstraints(extractedData);
  }

  /**
   * Parse financial statement format
   */
  private parseFinancialStatementFormat(data: FinancialStatementData, originalDocumentText: string): ExtractedTaxData {
    console.log('📋 Parsing financial statement format...');
    console.log('data:>>>>>>>>>>>>9999999999999', data);
    ///console.log('originalDocumentText:>>>>>>>>>>>>', originalDocumentText);
    
    // Extract basic info
    const { name: companyName, type: businessType } = extractCompanyInfo(originalDocumentText);
    const taxYear = extractYearFromText(originalDocumentText);

    // Safely extract financial data
    const financialData = this.extractFinancialData(data);
    
    console.log('📊 Financial statement extraction results:', financialData);

    const result = {
      taxpayerName: companyName,
      taxYear: taxYear,
      totalIncome: financialData.revenue,
      totalExpenses: financialData.expenses,
      totalDeductions: financialData.deductions,
      taxableAmount: financialData.profitBeforeTax || 
                    (financialData.revenue - financialData.expenses - financialData.deductions),
      taxId: "Not provided",
      businessType: businessType
    };

    return this.applySoftConstraints(result);
  }

  /**
   * Extract financial data from statement with safe array handling
   */
  private extractFinancialData(data: FinancialStatementData): {
    revenue: number;
    expenses: number;
    deductions: number;
    profitBeforeTax: number;
    retainedEarnings: number;
  } {
    // Ensure arrays exist
    const profitAndLoss = Array.isArray(data.Profit_and_Loss) ? data.Profit_and_Loss : [];
    const balanceSheet = Array.isArray(data.Balance_Sheet) ? data.Balance_Sheet : [];
    const retainedEarningsData = Array.isArray(data.Retained_Earnings) ? data.Retained_Earnings : [];

    // Extract revenue with flexible matching
    const revenue = this.findFinancialItem(profitAndLoss, 
      /revenue|income|sales|turnover/i,
      ['Amount', 'Expenses', 'Total_Income']
    );

    // Extract expenses
    const expenses = this.findFinancialItem(profitAndLoss,
      /(?:general|administrative|operating|total).*expenses?|expenses?.*(?:general|administrative|operating|total)/i,
      ['Expenses', 'Amount', 'Cost', 'Total_Expenses']
    );

    // Extract profit before tax
    const profitBeforeTax = this.findFinancialItem(profitAndLoss,
      /profit.*before.*tax|income.*before.*tax/i,
      ['Amount']
    );

    // Extract deductions/allowances
    const deductions = this.findFinancialItem(profitAndLoss,
      /capital.*allowances?|depreciation|deductions?|tax.*relief/i,
      ['Amount', 'Expenses']
    );

    // Extract retained earnings
    const retainedEarnings = retainedEarningsData[0]?.Retained_Earnings || 0;

    return {
      revenue,
      expenses,
      deductions,
      profitBeforeTax,
      retainedEarnings
    };
  }

  /**
   * Find financial item with flexible property matching
   */
  private findFinancialItem(
    items: FinancialStatementItem[],
    accountPattern: RegExp,
    propertyNames: string[]
  ): number {
    const matchingItem = items.find(item => accountPattern.test(item.Account));
    if (!matchingItem) return 0;

    // Try each property name in order
    for (const prop of propertyNames) {
      const value = matchingItem[prop as keyof FinancialStatementItem];
      if (typeof value === 'number' && !isNaN(value)) {
        return value;
      }
    }

    return 0;
  }

  /**
   * Extract amount from text using regex pattern
   */
  private extractAmountFromText(text: string, pattern: RegExp): number {
    try {
      const lines = text.split('\n');
      for (const line of lines) {
        if (pattern.test(line)) {
          console.log(` Analyzing line for pattern ${pattern.source}:`, line.trim());
          
          // Enhanced number matching with Ghana Cedis support
          const numberMatches = [
            // Ghana Cedis with parentheses (negative)
            line.match(/\(\s*(?:GH¢|₵)?\s*([\d,]+(?:\.\d+)?)\s*\)/),
            // Ghana Cedis positive amounts  
            line.match(/(?:GH¢|₵)\s*([\d,]+(?:\.\d+)?)/),
            // Numbers in parentheses (negative)
            line.match(/\(\s*([\d,]+(?:\.\d+)?)\s*\)/),
            // Regular positive numbers
            line.match(/([\d,]+(?:\.\d+)?)/),
          ];
          
          for (const match of numberMatches) {
            if (match && match[1]) {
              // Remove commas and convert to number
              let amount = parseFloat(match[1].replace(/,/g, ''));
              
              // Handle negative amounts (parentheses notation)
              if (match[0].includes('(') && match[0].includes(')')) {
                amount = -Math.abs(amount);
              }
              
              if (!isNaN(amount) && amount !== 0) {
                console.log(`💰 Extracted amount: ${amount} from pattern: ${pattern.source}`);
                return amount;
              }
            }
          }
        }
      }
      
      // Enhanced specific searches for Ghana financial statements
      if (pattern.source.includes('revenue')) {
        const revenuePatterns = [
          /Revenue\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /Sales\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /Turnover\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i
        ];
        
        for (const revPattern of revenuePatterns) {
          const match = text.match(revPattern);
          if (match) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            console.log(`💰 Found revenue: ${amount}`);
            return amount;
          }
        }
      }
      
      if (pattern.source.includes('profit.*before.*tax')) {
        const profitPatterns = [
          /Profit\s+before\s+tax\s+\((\d{1,3}(?:,\d{3})*(?:\.\d+)?)\)/i, // Negative in parentheses
          /Profit\s+before\s+tax\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i, // Positive
          /Profit.*before.*tax.*\((\d{1,3}(?:,\d{3})*(?:\.\d+)?)\)/i // More flexible negative
        ];
        
        for (const profitPattern of profitPatterns) {
          const match = text.match(profitPattern);
          if (match) {
            let amount = parseFloat(match[1].replace(/,/g, ''));
            // If found in parentheses pattern, make it negative
            if (profitPattern.source.includes('\\(')) {
              amount = -amount;
            }
            console.log(`💰 Found profit before tax: ${amount}`);
            return amount;
          }
        }
      }
      
      if (pattern.source.includes('expenses')) {
        const expensePatterns = [
          /General\s*&?\s*(?:admin?\.?|administrative)\s*expenses?\s+\((\d{1,3}(?:,\d{3})*(?:\.\d+)?)\)/i,
          /Operating\s+expenses?\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /Total\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i
        ];
        
        for (const expPattern of expensePatterns) {
          const match = text.match(expPattern);
          if (match) {
            let amount = parseFloat(match[1].replace(/,/g, ''));
            console.log(`💰 Found expenses: ${amount}`);
            return amount;
          }
        }
      }
      
      if (pattern.source.includes('capital.*allowances?|deductions?')) {
        const deductionPatterns = [
          /Capital\s+[Aa]llowances?\s+\((\d{1,3}(?:,\d{3})*(?:\.\d+)?)\)/i,
          /Capital\s+[Aa]llowances?\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i,
          /Depreciation\s+(?:GH¢)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i
        ];
        
        for (const deductPattern of deductionPatterns) {
          const match = text.match(deductPattern);
          if (match) {
            let amount = parseFloat(match[1].replace(/,/g, ''));
            console.log(`💰 Found deductions/capital allowances: ${amount}`);
            return amount;
          }
        }
      }
      
      return 0;
    } catch (error) {
      console.warn('Failed to extract amount from text:', error);
      return 0;
    }
  }

  /**
   * Parse AI response into structured data with enhanced validation
   */
  private parseAIResponse(content: string, originalDocumentText?: string): ExtractedTaxData {
    try {
      console.log('Parsing AI response...');
      
      let extractedData: any;
      try {
        extractedData = safeJSONParse(content);
        console.log('Successfully parsed JSON:', extractedData);
      } catch (error) {
        console.warn('All JSON parsing attempts failed, falling back to text extraction');
        return this.extractFromRawText(originalDocumentText || content);
      }

      // Handle different response formats
      if (!extractedData) {
        console.warn('No data could be extracted, falling back to text extraction');
        return this.extractFromRawText(originalDocumentText || content);
      }

      if ('validationData' in extractedData) {
        console.log('Processing enhanced data with validation...');
        return this.validateExtractedData(extractedData as EnhancedExtractedTaxData);
      }

      if ('Balance_Sheet' in extractedData || 'Profit_and_Loss' in extractedData) {
        console.log('Processing financial statement format...');
        return this.parseFinancialStatementFormat(extractedData as FinancialStatementData, originalDocumentText || content);
      }

      if (this.isSimplifiedResponse(extractedData)) {
        console.log('Processing simplified response format...');
        return this.parseSimplifiedResponse(extractedData, originalDocumentText || content);
      }

      // Standard format
      console.log('Processing standard format...');
      return this.processStandardFormat(extractedData, originalDocumentText || content);
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return this.extractFromRawText(originalDocumentText || content);
    }
  }

  /**
   * Extract data directly from text when JSON parsing fails
   */
  private extractFromRawText(text: string): ExtractedTaxData {
    console.log('📋 Extracting data directly from text...');
    const { name: companyName, type: businessType } = extractCompanyInfo(text);
    const taxYear = extractYearFromText(text);
    const amounts = this.extractTaxAmounts(text);

    return {
      taxpayerName: companyName,
      taxYear: taxYear,
      ...amounts,
      taxId: "Not provided",
      businessType: businessType
    };
  }

  /**
   * Process standard format response
   */
  private processStandardFormat(data: any, originalText: string): ExtractedTaxData {
    console.log('Processing standard format data...');
    
    // Use detailed breakdown if available
    if (data.detailedBreakdown) {
      console.log('Using detailed breakdown data...');
      const breakdown = data.detailedBreakdown;
      
      const normalizedData: ExtractedTaxData = {
        taxpayerName: data.taxpayerName || "Not provided",
        taxYear: data.taxYear || new Date().getFullYear(),
        totalIncome: breakdown.revenue || data.totalIncome || 0,
        totalExpenses: breakdown.generalAdminExpenses || data.totalExpenses || 0,
        totalDeductions: breakdown.capitalAllowances || breakdown.depreciation || data.totalDeductions || 0,
        taxableAmount: breakdown.profitBeforeTax || breakdown.chargeableIncome || data.taxableAmount || 0,
        taxId: data.taxId || "Not provided",
        businessType: data.businessType || "Not provided"
      };
      
      return this.applySoftConstraints(normalizedData);
    }
    
    // Standard format processing
    const normalizedData: ExtractedTaxData = {
      taxpayerName: data.taxpayerName || "Not provided",
      taxYear: data.taxYear || new Date().getFullYear(),
      totalIncome: typeof data.totalIncome === 'number' ? data.totalIncome : 0,
      totalExpenses: typeof data.totalExpenses === 'number' ? data.totalExpenses : 0,
      totalDeductions: typeof data.totalDeductions === 'number' ? data.totalDeductions : 0,
      taxableAmount: typeof data.taxableAmount === 'number' ? data.taxableAmount : 0,
      taxId: data.taxId || "Not provided",
      businessType: data.businessType || "Not provided"
    };

    return this.applySoftConstraints(normalizedData);
  }

  /**
   * Get default tax data structure
   */
  private getDefaultTaxData(): ExtractedTaxData {
    return {
      taxpayerName: 'Not provided',
      taxYear: new Date().getFullYear(),
      totalIncome: 0,
      totalExpenses: 0,
      totalDeductions: 0,
      taxableAmount: 0,
      taxId: 'Not provided',
      businessType: 'Not specified'
    };
  }

  /**
   * Generate annual report based on extracted tax data
   */
  async generateAnnualReport(extractedData: ExtractedTaxData): Promise<string> {
    if (this.availableProviders.length === 0) {
      return this.getDefaultAnnualReport(extractedData);
    }

    // Try providers in order of preference
    const providersToTry = this.getProvidersToTry();
    
    for (const provider of providersToTry) {
      try {
        console.log(`🔄 Generating annual report with ${provider}...`);
        const report = await this.generateReportWithProvider(provider, extractedData);
        console.log(`✅ Successfully generated annual report using ${provider}`);
        return report;
      } catch (error) {
        console.warn(`❌ ${provider} report generation failed:`, error);
      }
    }

    return this.getDefaultAnnualReport(extractedData);
  }

  /**
   * Generate report using a specific provider
   */
  private async generateReportWithProvider(
    provider: string,
    extractedData: ExtractedTaxData
  ): Promise<string> {
    const prompt = this.buildReportGenerationPrompt(extractedData);

    switch (provider) {
      case 'ollama':
        return this.generateReportWithOllama(prompt);
      case 'openai':
        return this.generateReportWithOpenAI(prompt);
      case 'claude':
        return this.generateReportWithClaude(prompt);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Generate report using Ollama
   */
  private async generateReportWithOllama(prompt: string): Promise<string> {
    if (!this.llm) throw new Error('Ollama not initialized');
    
    const response = await this.llm.invoke(prompt);
    return response;
  }

  /**
   * Generate report using OpenAI
   */
  private async generateReportWithOpenAI(prompt: string): Promise<string> {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const response = await this.openai.chat.completions.create({
      model: config.ai.openai.model,
      messages: [
        { role: 'system', content: 'You are a financial analyst and tax expert specializing in generating comprehensive annual reports.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Generate report using Claude
   */
  private async generateReportWithClaude(prompt: string): Promise<string> {
    if (!this.claude) throw new Error('Claude not initialized');

    try {
      const response = await this.claude.messages.create({
        model: config.ai.claude.model,
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (!response.content || response.content.length === 0) {
        throw new Error('Empty response from Claude');
      }

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      if (!content) {
        throw new Error('No text content in Claude response');
      }

      return content;
    } catch (error) {
      console.error('Claude report generation failed:', error); 
      throw error;
    }
  }

  /**
   * Build report generation prompt
   */
  private buildReportGenerationPrompt(extractedData: ExtractedTaxData): string {
   
    return `
      You are a senior financial analyst and tax expert. Based on the following extracted tax data, generate a comprehensive annual financial report. The report should be professional, detailed, and provide meaningful insights for business decision-making.

      EXTRACTED TAX DATA:
       ${JSON.stringify(extractedData, null, 2)}

      Please generate a comprehensive annual report that includes:

      1. **EXECUTIVE SUMMARY**
         - Brief overview of financial performance
         - Key highlights and achievements
         - Major challenges and opportunities

      2. **FINANCIAL PERFORMANCE ANALYSIS**
         - Revenue analysis and trends
         - Expense breakdown and analysis
         - Profitability metrics and ratios
         - Year-over-year comparison insights (if applicable)

      3. **TAX POSITION ANALYSIS**
         - Tax liability assessment
         - Deductions and allowances utilized
         - Tax efficiency recommendations
         - Compliance status overview

      4. **BUSINESS INSIGHTS**
         - Industry benchmarking (if applicable)
         - Financial health indicators
         - Risk assessment
         - Growth potential analysis

      5. **RECOMMENDATIONS**
        - Strategic financial recommendations
        - Tax optimization opportunities
        - Cost management suggestions
        - Growth and investment recommendations

      6. **CONCLUSION**
         - Overall financial position summary
        - Key takeaways for stakeholders
        - Forward-looking statements

      FORMAT REQUIREMENTS:
      - Use clear headings and subheadings
      - Include bullet points for key insights
      - Provide specific numbers and percentages where relevant
      - Keep the tone professional and analytical
      - Ensure the report is between 800-1200 words
      - Focus on actionable insights and recommendations

      Generate the annual report now:
    `;
  }

  /**
   * Get default annual report when AI is not available
   */
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
} 