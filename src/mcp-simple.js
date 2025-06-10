#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import fs from 'fs';
// Import services
import { DocumentParser } from './services/documentParser.js';
import { ragExtractorService } from './services/ragExtractorService.js';
import { ReportGenerator } from './services/reportGenerator.js';
// Import SDK modules
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
// Override console to use stderr for MCP compatibility
const originalConsole = { ...console };
console.log = (...args) => originalConsole.error('[LOG]', ...args);
console.warn = (...args) => originalConsole.error('[WARN]', ...args);
console.info = (...args) => originalConsole.error('[INFO]', ...args);
// Find the project root by looking for package.json
function findProjectRoot(startDir) {
    let currentDir = startDir;
    while (currentDir !== dirname(currentDir)) {
        if (existsSync(join(currentDir, 'package.json'))) {
            return currentDir;
        }
        currentDir = dirname(currentDir);
    }
    return startDir;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = findProjectRoot(__dirname);
// Ensure required directories exist
const ensureDirectories = () => {
    const dirs = [
        join(projectRoot, 'uploads'),
        join(projectRoot, 'reports'),
        join(projectRoot, 'temp')
    ];
    dirs.forEach(dir => {
        if (!existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    });
};
// Helper function to create mock UploadedFile from file path
function createMockUploadedFile(filePath) {
    const stats = fs.statSync(filePath);
    const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeTypeMap = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'csv': 'text/csv',
        'txt': 'text/plain'
    };
    return {
        fieldname: 'document',
        originalname: filePath.split('/').pop() || 'unknown',
        encoding: '7bit',
        mimetype: mimeTypeMap[fileExtension] || 'application/octet-stream',
        destination: dirname(filePath),
        filename: filePath.split('/').pop() || 'unknown',
        path: filePath,
        size: stats.size
    };
}
// Type guard functions
function isProcessDocumentArgs(args) {
    return args && typeof args.documentPath === 'string';
}
function isGenerateReportArgs(args) {
    return args && args.extractedData && typeof args.extractedData === 'object';
}
function isGetAIStatusArgs(args) {
    return args !== undefined;
}
function isValidateDocumentArgs(args) {
    return args && typeof args.documentPath === 'string';
}
// Main initialization function
async function initializeServer() {
    try {
        // Create required directories
        ensureDirectories();
        // Create service instances
        const documentParser = new DocumentParser();
        const reportGenerator = new ReportGenerator();
        // Initialize RAG extractor
        console.log('🔄 Initializing AI services...');
        await ragExtractorService.initialize();
        const aiStatus = {
            enabled: ragExtractorService.isEnabled(),
            providers: ragExtractorService.getAvailableProviders()
        };
        console.log('✅ AI services initialized:', aiStatus);
        // Create server instance with proper capabilities
        const server = new Server({
            name: 'gra-tax-processor',
            version: '1.0.0',
            description: 'Ghana Revenue Authority Tax Document Processor - AI-powered tax document analysis and report generation',
        }, {
            capabilities: {
                tools: {}
            }
        });
        // Define available tools
        const AVAILABLE_TOOLS = [
            {
                name: 'process_document',
                description: 'Process a tax document and extract relevant financial information using AI',
                inputSchema: {
                    type: 'object',
                    properties: {
                        documentPath: {
                            type: 'string',
                            description: 'Path to the tax document file (PDF, DOC, DOCX, or TXT)'
                        },
                        taxpayerName: {
                            type: 'string',
                            description: 'Optional: Name of the taxpayer or business entity'
                        },
                        taxYear: {
                            type: 'number',
                            description: 'Optional: Tax year for the document (e.g., 2024)'
                        },
                        extractionMode: {
                            type: 'string',
                            enum: ['standard', 'detailed', 'validation'],
                            description: 'Optional: Extraction mode - standard (default), detailed (with validation), or validation (cross-check only)',
                            default: 'standard'
                        }
                    },
                    required: ['documentPath']
                }
            },
            {
                name: 'generate_annual_report',
                description: 'Generate a comprehensive annual financial report from extracted tax data',
                inputSchema: {
                    type: 'object',
                    properties: {
                        extractedData: {
                            type: 'object',
                            description: 'Previously extracted tax data object'
                        },
                        reportFormat: {
                            type: 'string',
                            enum: ['markdown', 'html', 'pdf'],
                            description: 'Output format for the report',
                            default: 'markdown'
                        },
                        includeAnalysis: {
                            type: 'boolean',
                            description: 'Whether to include detailed financial analysis',
                            default: true
                        }
                    },
                    required: ['extractedData']
                }
            },
            {
                name: 'get_ai_status',
                description: 'Get the current status of AI processing capabilities and provider connections',
                inputSchema: {
                    type: 'object',
                    properties: {
                        testConnection: {
                            type: 'boolean',
                            description: 'Whether to test provider connections (may take a few seconds)',
                            default: false
                        }
                    }
                }
            },
            {
                name: 'validate_document',
                description: 'Validate a document format and readability before processing',
                inputSchema: {
                    type: 'object',
                    properties: {
                        documentPath: {
                            type: 'string',
                            description: 'Path to the document file to validate'
                        }
                    },
                    required: ['documentPath']
                }
            }
        ];
        // List available tools
        server.setRequestHandler(ListToolsRequestSchema, async () => {
            console.log('📋 Listing available tools...');
            return {
                tools: AVAILABLE_TOOLS
            };
        });
        // Handle tool calls with improved error handling
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            console.log(`📥 Received request for tool: ${request.params.name}`);
            console.log(`📝 Parameters:`, JSON.stringify(request.params.arguments, null, 2));
            try {
                switch (request.params.name) {
                    case 'process_document': {
                        if (!isProcessDocumentArgs(request.params.arguments)) {
                            throw new Error('Invalid arguments for process_document');
                        }
                        const { documentPath, taxpayerName, taxYear, extractionMode = 'standard' } = request.params.arguments;
                        // Validate document exists
                        if (!existsSync(documentPath)) {
                            throw new Error(`Document not found: ${documentPath}`);
                        }
                        console.log('🔄 Processing document:', { documentPath, taxpayerName, taxYear, extractionMode });
                        // Parse document
                        console.log('🔄 Parsing document...');
                        const mockFile = createMockUploadedFile(documentPath);
                        const documentText = await documentParser.parseDocument(mockFile);
                        console.log(`✅ Document parsed successfully. Text length: ${documentText.length} characters`);
                        if (documentText.length < 50) {
                            throw new Error('Document appears to be empty or contains insufficient text for processing');
                        }
                        // Extract tax data using AI
                        console.log('🔄 Extracting tax data...');
                        const context = `Taxpayer: ${taxpayerName || 'Unknown'}\nTax Year: ${taxYear || new Date().getFullYear()}\nExtraction Mode: ${extractionMode}`;
                        const extractedData = await ragExtractorService.extractTaxData(documentText, context);
                        console.log('✅ Tax data extracted successfully');
                        // Generate report
                        console.log('🔄 Generating report...');
                        const report = await reportGenerator.generateReport(extractedData);
                        console.log(`✅ Report generated: ${report.id}`);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `# Document Processing Complete ✅

**Document:** \`${documentPath}\`
**Taxpayer:** ${taxpayerName || 'Not specified'}
**Tax Year:** ${taxYear || new Date().getFullYear()}
**Extraction Mode:** ${extractionMode}

## Processing Results

- **Document Parsed:** ✅ ${documentText.length.toLocaleString()} characters extracted
- **AI Extraction:** ${ragExtractorService.isEnabled() ? '✅ AI-powered extraction completed' : '⚠️ Fallback extraction (AI disabled)'}
- **Report Generated:** ✅ ${report.id}

## Extracted Financial Data

\`\`\`json
${JSON.stringify(extractedData, null, 2)}
\`\`\`

## Summary
- **Total Income:** $${extractedData.totalIncome?.toLocaleString() || 'N/A'}
- **Total Expenses:** $${extractedData.totalExpenses?.toLocaleString() || 'N/A'}
- **Taxable Amount:** $${extractedData.taxableAmount?.toLocaleString() || 'N/A'}
- **Business Type:** ${extractedData.businessType || 'Not identified'}

**Report Location:** \`${report.filePath}\`

*Next Steps: Review extracted data for accuracy and submit for tax processing.*`
                                }
                            ]
                        };
                    }
                    case 'generate_annual_report': {
                        if (!isGenerateReportArgs(request.params.arguments)) {
                            throw new Error('Invalid arguments for generate_annual_report');
                        }
                        const { extractedData, reportFormat = 'markdown', includeAnalysis = true } = request.params.arguments;
                        if (!extractedData || typeof extractedData !== 'object') {
                            throw new Error('Valid extracted data object is required');
                        }
                        console.log('🔄 Generating annual report...', { reportFormat, includeAnalysis });
                        let reportContent;
                        if (ragExtractorService.isEnabled()) {
                            reportContent = await ragExtractorService.generateAnnualReport(extractedData);
                        }
                        else {
                            reportContent = `# Annual Financial Report\n\n*Generated from extracted tax data*\n\n${JSON.stringify(extractedData, null, 2)}`;
                        }
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `# Annual Report Generated ✅

**Format:** ${reportFormat}
**Analysis Included:** ${includeAnalysis ? 'Yes' : 'No'}
**AI-Generated:** ${ragExtractorService.isEnabled() ? 'Yes' : 'No (Template-based)'}

---

${reportContent}`
                                }
                            ]
                        };
                    }
                    case 'get_ai_status': {
                        if (!isGetAIStatusArgs(request.params.arguments)) {
                            throw new Error('Invalid arguments for get_ai_status');
                        }
                        const { testConnection = false } = request.params.arguments;
                        console.log('🔄 Getting AI status...', { testConnection });
                        const isEnabled = ragExtractorService.isEnabled();
                        const providers = ragExtractorService.getAvailableProviders();
                        let connectionStatus = {};
                        if (testConnection) {
                            console.log('🔄 Testing provider connections...');
                            connectionStatus = await ragExtractorService.testConnection();
                        }
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `# AI Processing Status

## Current Status
- **AI Enabled:** ${isEnabled ? '✅ Yes' : '❌ No'}
- **Available Providers:** ${providers.length > 0 ? providers.join(', ') : 'None'}
- **Preferred Provider:** ${ragExtractorService.preferredProvider || 'Not set'}

${testConnection ? `## Connection Test Results
${Object.entries(connectionStatus)
                                        .map(([provider, status]) => `- **${provider}:** ${status ? '✅ Connected' : '❌ Not Connected'}`)
                                        .join('\n')}` : ''}

${!isEnabled ? `## ⚠️ AI Processing Disabled
To enable AI features, ensure:
1. **Ollama:** Running locally (\`ollama serve\`)
2. **OpenAI:** API key configured in environment
3. **Claude:** API key configured in environment` : ''}

## Server Information
- **Working Directory:** \`${process.cwd()}\`
- **Project Root:** \`${projectRoot}\`
- **Node Version:** ${process.version}
- **Platform:** ${process.platform}
- **Memory Usage:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
                                }
                            ]
                        };
                    }
                    case 'validate_document': {
                        if (!isValidateDocumentArgs(request.params.arguments)) {
                            throw new Error('Invalid arguments for validate_document');
                        }
                        const { documentPath } = request.params.arguments;
                        console.log('🔄 Validating document:', documentPath);
                        if (!existsSync(documentPath)) {
                            throw new Error(`Document not found: ${documentPath}`);
                        }
                        // Get file stats
                        const stats = fs.statSync(documentPath);
                        const fileExtension = documentPath.split('.').pop()?.toLowerCase();
                        const supportedFormats = ['pdf', 'doc', 'docx', 'txt', 'csv', 'xlsx', 'xls'];
                        // Test parsing
                        let parseTest = { success: false, textLength: 0, error: null };
                        try {
                            const mockFile = createMockUploadedFile(documentPath);
                            const testText = await documentParser.parseDocument(mockFile);
                            parseTest = { success: true, textLength: testText.length, error: null };
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                            parseTest = { success: false, textLength: 0, error: errorMessage };
                        }
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `# Document Validation Results

**File:** \`${documentPath}\`

## File Information
- **Size:** ${(stats.size / 1024).toFixed(2)} KB
- **Format:** ${fileExtension?.toUpperCase() || 'Unknown'}
- **Supported:** ${supportedFormats.includes(fileExtension || '') ? '✅ Yes' : '❌ No'}
- **Last Modified:** ${stats.mtime.toISOString()}

## Parsing Test
- **Readable:** ${parseTest.success ? '✅ Yes' : '❌ No'}
- **Text Length:** ${parseTest.textLength.toLocaleString()} characters
${parseTest.error ? `- **Error:** ${parseTest.error}` : ''}

## Recommendations
${parseTest.success ?
                                        parseTest.textLength > 100 ?
                                            '✅ Document is ready for processing.' :
                                            '⚠️ Document contains minimal text. Results may be limited.'
                                        :
                                            '❌ Document cannot be processed. Please check the file format and integrity.'}`
                                }
                            ]
                        };
                    }
                    default:
                        throw new Error(`Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const errorStack = error instanceof Error ? error.stack : 'No stack trace available';
                console.error(`❌ Error processing ${request.params.name}:`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `# Error Processing Request ❌

**Tool:** ${request.params.name}
**Error:** ${errorMessage}

## Details
\`\`\`
${errorStack}
\`\`\`

## Troubleshooting
- Verify all required parameters are provided
- Check file paths and permissions
- Ensure AI services are properly configured
- Review server logs for additional details`
                        }
                    ],
                    isError: true
                };
            }
        });
        // Enhanced error handling and graceful shutdown
        process.on('SIGINT', async () => {
            console.error('\n🛑 Shutting down server gracefully...');
            process.exit(0);
        });
        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error);
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
        // Start server
        console.log('🚀 Starting GRA Tax Processor MCP server...');
        console.log(`📂 Project root: ${projectRoot}`);
        console.log(`🤖 AI Status: ${aiStatus.enabled ? 'Enabled' : 'Disabled'} (${aiStatus.providers.join(', ') || 'No providers'})`);
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.log('✅ MCP Server ready and listening!');
        console.log('🔧 Available tools: process_document, generate_annual_report, get_ai_status, validate_document');
    }
    catch (error) {
        console.error('💥 Failed to initialize server:', error);
        throw error;
    }
}
// Initialize and start the server
initializeServer().catch((error) => {
    console.error('💥 Failed to initialize server:', error);
    process.exit(1);
});
