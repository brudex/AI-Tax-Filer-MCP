import { config } from '../config/config.js';
import { ExtractedTaxData } from '../types/index.js';
import { Ollama } from '@langchain/community/llms/ollama';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { Document } from '@langchain/core/documents';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Add these interfaces at the top of the file after the imports
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
   * Initialize all AI providers
   */
  async initialize(): Promise<void> {
    try {
      // Initialize Ollama
      if (config.ai.ollama.enabled) {
        try {
          // Initialize Ollama embeddings with timeout
          let embeddingsInstance: OllamaEmbeddings | null = null;
          try {
            embeddingsInstance = new OllamaEmbeddings({
              model: config.ai.ollama.model,
              baseUrl: config.ai.ollama.baseUrl
            });

            // Test embeddings with timeout
            const embeddingsPromise = embeddingsInstance.embedQuery("Test embeddings");
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Ollama embeddings timeout')), 5000);
            });

            await Promise.race([embeddingsPromise, timeoutPromise]);
            
            // Only set the instance variables after successful test
            this.embeddings = embeddingsInstance;
            this.vectorStore = new MemoryVectorStore(this.embeddings);
            console.log('✅ Ollama embeddings initialized successfully');
          } catch (error) {
            console.warn('⚠️  Failed to initialize Ollama embeddings:', error instanceof Error ? error.message : String(error));
            console.warn('   Is Ollama running? Try starting it with: ollama serve');
            embeddingsInstance = null;
            this.embeddings = null;
            this.vectorStore = null;
          }

          // Initialize Ollama LLM
          let llmInstance: Ollama | null = null;
          try {
            console.log('🔄 Creating Ollama LLM instance...');
            llmInstance = new Ollama({
          baseUrl: config.ai.ollama.baseUrl,
          model: config.ai.ollama.model,
              temperature: 0.1, // Add low temperature for more deterministic responses
        });
        
            // Test Ollama LLM connection with timeout
            console.log('🔄 Testing Ollama LLM connection...');
            const testPromise = llmInstance.invoke("hi");
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Ollama LLM timeout')), 15000);
            });
            
            try {
              const testResponse = await Promise.race([testPromise, timeoutPromise]);
              console.log('🔄 Ollama LLM test response:', testResponse);
        if (testResponse) {
                // Only set the instance variable after successful test
                this.llm = llmInstance;
                this.availableProviders.push('ollama');
                console.log('✅ Ollama LLM initialized successfully');
              }
            } catch (error) {
              console.warn('⚠️  Failed to connect to Ollama LLM:', error instanceof Error ? error.message : String(error));
              console.warn('   Is Ollama running? Try starting it with: ollama serve');
              if (error instanceof Error && error.stack) {
                console.warn('   Stack trace:', error.stack);
              }
              llmInstance = null;
              this.llm = null;
            }

            // If both embeddings and LLM failed, clean up
            if (!this.embeddings && !this.llm) {
              console.warn('⚠️  Both Ollama embeddings and LLM failed to initialize');
              this.embeddings = null;
              this.vectorStore = null;
              this.llm = null;
            }
          } catch (error) {
            console.warn('⚠️  Failed to initialize Ollama:', error instanceof Error ? error.message : String(error));
            this.llm = null;
            this.embeddings = null;
            this.vectorStore = null;
        }
        } catch (error) {
          console.warn('⚠️  Failed to initialize Ollama:', error instanceof Error ? error.message : String(error));
          this.llm = null;
          this.embeddings = null;
          this.vectorStore = null;
        }
      }

      // Initialize OpenAI
      if (config.ai.openai.enabled && config.ai.openai.apiKey) {
        try {
          this.openai = new OpenAI({
            apiKey: config.ai.openai.apiKey,
          });
          this.availableProviders.push('openai');
          console.log('✅ OpenAI initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize OpenAI:', error);
        }
      }

      // Initialize Claude
      if (config.ai.claude.enabled && config.ai.claude.apiKey) {
        try {
          this.claude = new Anthropic({
            apiKey: config.ai.claude.apiKey,
          });
          this.availableProviders.push('claude');
          console.log('✅ Claude initialized successfully');
        } catch (error) {
          console.warn('⚠️  Failed to initialize Claude:', error);
        }
      }

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
        console.log(`🔄 Attempting extraction with ${provider}...`);
        const result = await this.extractWithProvider(provider, documentText, context);
        console.log('result>>>>>>>>>>>>>>>>', result);
        console.log(`✅ Successfully extracted data using ${provider}`);
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
      You are a tax document analysis expert. Extract tax-related information from this financial statement.
      Return ONLY a valid JSON object with the extracted values, no explanations or formatting.

      CRITICAL FIELD REQUIREMENTS:
      You MUST identify and extract these key financial fields with high priority:
      - Revenue/Sales/Turnover (primary income source)
      - Profit Before Tax (essential for tax calculations)
      - Operating Expenses (total operational costs)
      - Cost of Sales/Cost of Goods Sold (if applicable)
      - Net Profit/Loss After Tax
      - Retained Earnings (accumulated profits)

      FIELD DETECTION STRATEGIES:
      1. Revenue Detection - Look for these patterns:
         - "Revenue", "Sales", "Turnover", "Income from operations"
         - "Gross receipts", "Service income", "Trading income"
         - Usually the largest positive number in P&L statement
      
      2. Profit Before Tax - Look for:
         - "Profit before tax", "Income before tax", "Earnings before tax"
         - "Pre-tax profit", "Profit before income tax"
         - Should be Revenue minus all expenses before tax
      
      3. Cross-Reference Validation:
         - Net Profit + Tax Paid should approximate Profit Before Tax
         - Revenue - Cost of Sales = Gross Profit
         - Gross Profit - Operating Expenses ≈ Operating Profit

      IMPORTANT JSON FORMATTING RULES:
      1. Use double quotes for all keys and string values
      2. Use numbers without quotes (e.g., 1000 not "1000")
      3. Remove all currency symbols and commas from numbers
      4. Negative numbers should be prefixed with minus sign (e.g., -1000)
      5. Do not include any comments or explanations in the JSON
      6. Do not wrap the JSON in code blocks or markdown

      Enhanced Guidelines for extraction:
      1. Company Name: Extract from the header/title of the financial statements
      2. Tax Year: Extract from the statement period/date (e.g., "year ended 31st December 2023" = 2023)
      3. Total Income: PRIORITY - Find primary revenue/sales figure first, then add other income
      4. Total Expenses: Sum of all operating expenses, administrative costs, etc.
      5. Total Deductions: Include:
         - Capital allowances
         - Tax relief items
         - Qualifying deductions
         - Depreciation
         - Any other allowable deductions
      6. Taxable Amount: PRIORITY - Use "Profit before tax" (preferred) or calculate as (Total Income - Total Expenses - Total Deductions)
      7. Tax ID: Look for TIN, Tax Reference Number, or similar identifiers
      8. Business Type: Determine from:
         - Company name
         - Nature of business section
         - Main revenue sources
         - Principal activities

      VALIDATION REQUIREMENTS:
      - Ensure Revenue > 0 if company is operational
      - Verify Profit Before Tax = Revenue - Total Expenses - Deductions (approximately)
      - Check that amounts are reasonable and consistent

      Enhanced response format with additional validation fields:
      {
        "taxpayerName": "COMPANY NAME LTD",
        "taxYear": 2024,
        "totalIncome": 50000,
        "totalExpenses": 30000,
        "totalDeductions": 5000,
        "taxableAmount": 15000,
        "taxId": "TIN12345",
        "businessType": "Technology Services",
        "validationData": {
          "revenue": 50000,
          "profitBeforeTax": 15000,
          "netProfitAfterTax": 12000,
          "retainedEarnings": 45000,
          "costOfSales": 15000,
          "operatingExpenses": 20000
        }
      }

        Additional context: ${context}

        Document text:
        ${documentText}

      Remember: Return ONLY a valid JSON object with the extracted values, no explanations or formatting.
      Focus on accurate detection of Revenue and Profit Before Tax as these are critical for tax calculations.
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
   * Apply soft constraints to ensure data quality
   */
  private applySoftConstraints(data: ExtractedTaxData): ExtractedTaxData {
    const constrainedData = { ...data };

    // Soft constraint 1: Revenue should be positive for operational companies
    if (constrainedData.totalIncome <= 0 && constrainedData.businessType !== 'Holding Company') {
      console.warn('⚠️  Revenue is zero or negative for operational company - this may indicate extraction error');
    }

    // Soft constraint 2: Total expenses shouldn't exceed revenue by more than 200% (loss-making companies)
    if (constrainedData.totalExpenses > constrainedData.totalIncome * 3) {
      console.warn('⚠️  Expenses are significantly higher than revenue - verify extraction accuracy');
    }

    // Soft constraint 3: Taxable amount should be reasonable
    const calculatedTaxable = constrainedData.totalIncome - constrainedData.totalExpenses - constrainedData.totalDeductions;
    if (Math.abs(calculatedTaxable - constrainedData.taxableAmount) > Math.max(1000, constrainedData.totalIncome * 0.1)) {
      console.warn(`⚠️  Taxable amount (${constrainedData.taxableAmount}) differs significantly from calculated value (${calculatedTaxable})`);
      // Use calculated value if the difference is substantial
      if (constrainedData.taxableAmount === 0 && calculatedTaxable !== 0) {
        constrainedData.taxableAmount = calculatedTaxable;
        console.log(`✅ Taxable amount corrected to calculated value: ${calculatedTaxable}`);
      }
    }

    // Soft constraint 4: Ensure numeric values are reasonable
    const numericFields: (keyof ExtractedTaxData)[] = ['totalIncome', 'totalExpenses', 'totalDeductions', 'taxableAmount'];
    numericFields.forEach(field => {
      const value = constrainedData[field] as number;
      if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
        (constrainedData[field] as number) = 0;
        console.warn(`⚠️  Invalid numeric value for ${field}, reset to 0`);
      }
    });

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
    console.log('📋 Parsing simplified response format...');
    
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
    
    // Extract company details and tax year from the original document text
    const { companyName, businessType } = this.extractCompanyDetails(originalDocumentText);
    const taxYear = this.extractTaxYear(originalDocumentText);

    // Extract financial data with more flexible key detection
    const revenue = data.Profit_and_Loss?.find(item => 
      /revenue|income|sales|turnover/i.test(item.Account))?.Amount || 
      data.Profit_and_Loss?.find(item => 
        /revenue|income|sales|turnover/i.test(item.Account))?.Expenses || 0;
    
    // Look for expenses with flexible matching and check multiple property names
    const expensesItem = data.Profit_and_Loss?.find(item => 
      /(?:general|administrative|operating|total).*expenses?|expenses?.*(?:general|administrative|operating|total)/i.test(item.Account));
    const expenses = expensesItem?.Expenses || expensesItem?.Amount || expensesItem?.Cost || 0;
    
    const profitBeforeTax = data.Profit_and_Loss?.find(item => 
      /profit.*before.*tax|income.*before.*tax/i.test(item.Account))?.Amount || 0;

    // Look for deductions/allowances with flexible matching
    const deductionsItem = data.Profit_and_Loss?.find(item => 
      /capital.*allowances?|depreciation|deductions?|tax.*relief/i.test(item.Account));
    const deductions = deductionsItem?.Amount || deductionsItem?.Expenses || 0;

    // Try to get retained earnings as additional context
    const retainedEarnings = data.Retained_Earnings?.[0]?.Retained_Earnings || 0;

    console.log('📊 Financial statement extraction results:', {
      revenue,
      expenses,
      deductions,
      profitBeforeTax,
      retainedEarnings
    });

    return {
      taxpayerName: companyName,
      taxYear: taxYear,
      totalIncome: revenue,
      totalExpenses: expenses,
      totalDeductions: deductions,
      taxableAmount: profitBeforeTax || (revenue - expenses - deductions),
      taxId: "Not provided", // Look for TIN in the data
      businessType: businessType
    };
  }

  /**
   * Extract amount from text using regex pattern
   */
  private extractAmountFromText(text: string, pattern: RegExp): number {
    try {
      const lines = text.split('\n');
      for (const line of lines) {
        if (pattern.test(line)) {
          // Look for numbers in the line, handling both positive and negative amounts
          const numberMatches = [
            line.match(/(?:GH¢|₵)?\s*([\d,]+(?:\.\d+)?)/), // Positive amounts
            line.match(/\(\s*([\d,]+(?:\.\d+)?)\s*\)/),    // Negative amounts in parentheses
            line.match(/([\d,]+(?:\.\d+)?)/),              // Any number
          ];
          
          for (const match of numberMatches) {
            if (match) {
              // Remove commas and convert to number
              let amount = parseFloat(match[1].replace(/,/g, ''));
              
              // Handle negative amounts (parentheses notation)
              if (line.includes('(') && line.includes(')')) {
                amount = -Math.abs(amount);
              }
              
              if (!isNaN(amount)) {
                return amount;
              }
            }
          }
        }
      }
      
      // If pattern-based search fails, try to find specific financial statement items
      if (pattern.source.includes('revenue')) {
        // Look for "Revenue" line specifically
        const revenueMatch = text.match(/Revenue\s+(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/i);
        if (revenueMatch) {
          return parseFloat(revenueMatch[1].replace(/,/g, ''));
        }
      }
      
      if (pattern.source.includes('profit.*before.*tax')) {
        // Look for "Profit before tax" line specifically
        const profitMatch = text.match(/Profit\s+before\s+tax\s+\(?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*\)?/i);
        if (profitMatch) {
          let amount = parseFloat(profitMatch[1].replace(/,/g, ''));
          // Check if it's in parentheses (negative)
          if (profitMatch[0].includes('(') && profitMatch[0].includes(')')) {
            amount = -amount;
          }
          return amount;
        }
      }
      
      if (pattern.source.includes('expenses')) {
        // Look for "General & admn. expenses" or similar
        const expenseMatch = text.match(/(?:General|Administrative|Operating).*expenses?\s+\(?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*\)?/i);
        if (expenseMatch) {
          let amount = parseFloat(expenseMatch[1].replace(/,/g, ''));
          // Expenses are typically shown as positive but should be treated as expenses
          return amount;
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
      // Clean the response to ensure it's valid JSON
      let cleanedContent = content.trim();
      
      // Remove markdown code blocks if present
      cleanedContent = cleanedContent.replace(/```json\n?|\n?```/g, '');
      
      // Remove any leading/trailing whitespace or newlines
      cleanedContent = cleanedContent.trim();

      // Log the cleaned content for debugging
      console.log('Cleaned AI response:', cleanedContent);

      const extractedData = JSON.parse(cleanedContent) as FinancialStatementData | ExtractedTaxData | EnhancedExtractedTaxData;
      console.log('Parsed data:', extractedData);

      // Check if it's enhanced data with validation fields
      if ('validationData' in extractedData) {
        const enhancedData = extractedData as EnhancedExtractedTaxData;
        console.log('🔍 Validation data found, performing cross-verification...');
        return this.validateExtractedData(enhancedData);
      }

      // Handle various response formats
      if ('Balance_Sheet' in extractedData || 'Profit_and_Loss' in extractedData) {
        return this.parseFinancialStatementFormat(extractedData as FinancialStatementData, originalDocumentText || content);
      }

      // Handle simplified AI responses (like {"Revenue": 1680, "ProfitBeforeTax": 1680})
      if (this.isSimplifiedResponse(extractedData)) {
        return this.parseSimplifiedResponse(extractedData, originalDocumentText || content);
      }

      // If it's already in our expected format, validate and return
      const taxData = extractedData as ExtractedTaxData;
      const normalizedData: ExtractedTaxData = {
        taxpayerName: taxData.taxpayerName || "Not provided",
        taxYear: taxData.taxYear || new Date().getFullYear(),
        totalIncome: typeof taxData.totalIncome === 'number' ? taxData.totalIncome : 0,
        totalExpenses: typeof taxData.totalExpenses === 'number' ? taxData.totalExpenses : 0,
        totalDeductions: typeof taxData.totalDeductions === 'number' ? taxData.totalDeductions : 0,
        taxableAmount: typeof taxData.taxableAmount === 'number' ? taxData.taxableAmount : 0,
        taxId: taxData.taxId || "Not provided",
        businessType: taxData.businessType || "Not provided"
      };

      // Apply soft constraints even to standard format
      return this.applySoftConstraints(normalizedData);
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      console.error('Raw response:', content);
      
      // If JSON parsing fails, try to extract data directly from the document text
      const { companyName, businessType } = this.extractCompanyDetails(originalDocumentText || content);
      const taxYear = this.extractTaxYear(originalDocumentText || content);
      const amounts = this.extractTaxAmounts(originalDocumentText || content);

      return {
        taxpayerName: companyName,
        taxYear: taxYear,
        ...amounts,
        taxId: "Not provided",
        businessType: businessType
      };
    }
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
      - Company Name: ${extractedData.taxpayerName}
      - Tax Year: ${extractedData.taxYear}
      - Total Income: $${extractedData.totalIncome.toLocaleString()}
      - Total Expenses: $${extractedData.totalExpenses.toLocaleString()}
      - Total Deductions: $${extractedData.totalDeductions.toLocaleString()}
      - Taxable Amount: $${extractedData.taxableAmount.toLocaleString()}
      - Tax ID: ${extractedData.taxId}
      - Business Type: ${extractedData.businessType}

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