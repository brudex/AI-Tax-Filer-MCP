#!/usr/bin/env node

// GRA Tax Processor MCP Server - Full Version
// Redirect ALL output to stderr to prevent JSON-RPC corruption

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// Import our services (from compiled JavaScript)
const path = require('path');
const fs = require('fs');

// Override ALL console methods to use stderr
const stderr = process.stderr;
console.log = (...args) => stderr.write(`[LOG] ${args.join(" ")}\n`);
console.warn = (...args) => stderr.write(`[WARN] ${args.join(" ")}\n`);
console.info = (...args) => stderr.write(`[INFO] ${args.join(" ")}\n`);
console.error = (...args) => stderr.write(`[ERROR] ${args.join(" ")}\n`);

// Catch any uncaught output
process.on("uncaughtException", (error) => {
  stderr.write(`[UNCAUGHT] ${error.message}\n`);
  stderr.write(`[STACK] ${error.stack}\n`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  stderr.write(`[REJECTION] ${reason}\n`);
  process.exit(1);
});

// Global services - will be initialized in main()
let ragExtractorService = null;
let DocumentParser = null;

async function main() {
  try {
    stderr.write("[INFO] Starting GRA Tax Processor MCP server...\n");
    
    // Try to load compiled services
    try {
      const distPath = path.join(__dirname, 'dist');
      if (fs.existsSync(distPath)) {
        stderr.write("[INFO] Loading compiled services from dist/...\n");
        const { ragExtractorService: ragService } = require('./dist/services/ragExtractorService.js');
        const { DocumentParser: DocParser } = require('./dist/services/documentParser.js');
        ragExtractorService = ragService;
        DocumentParser = DocParser;
        
        // Initialize the RAG extractor service
        await ragExtractorService.initialize();
        stderr.write("[INFO] RAG extractor service initialized\n");
      } else {
        stderr.write("[WARN] Compiled services not found, running in minimal mode\n");
      }
    } catch (importError) {
      stderr.write(`[WARN] Failed to load services: ${importError.message}\n`);
      stderr.write("[INFO] Running in minimal mode\n");
    }

    // Create server
    const server = new Server(
      {
        name: "gra-tax-processor",
        version: "1.0.0",
        description: "Ghana Revenue Authority Tax Document Processor with AI-powered extraction"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Define comprehensive tools
    const tools = [
      {
        name: "process_document",
        description: "Process and extract tax data from uploaded documents (PDF, DOCX, Excel, CSV)",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the document file to process"
            },
            fileName: {
              type: "string", 
              description: "Original name of the file"
            },
            context: {
              type: "string",
              description: "Additional context for processing (optional)",
              default: ""
            }
          },
          required: ["filePath", "fileName"]
        }
      },
      {
        name: "generate_annual_report",
        description: "Generate comprehensive annual financial report from extracted tax data",
        inputSchema: {
          type: "object",
          properties: {
            taxpayerName: { type: "string", description: "Company/taxpayer name" },
            taxYear: { type: "number", description: "Tax year" },
            totalIncome: { type: "number", description: "Total income amount" },
            totalExpenses: { type: "number", description: "Total expenses amount" },
            totalDeductions: { type: "number", description: "Total deductions amount" },
            taxableAmount: { type: "number", description: "Taxable amount" },
            taxId: { type: "string", description: "Tax ID/TIN" },
            businessType: { type: "string", description: "Type of business" }
          },
          required: ["taxpayerName", "taxYear", "totalIncome", "totalExpenses", "taxableAmount"]
        }
      },
      {
        name: "get_ai_status",
        description: "Check the status of AI providers (Ollama, OpenAI, Claude) and their availability",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "validate_document",
        description: "Validate document format and readability before processing",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the document file to validate"
            },
            fileName: {
              type: "string",
              description: "Original name of the file"
            }
          },
          required: ["filePath", "fileName"]
        }
      },
      {
        name: "test_connection",
        description: "Test the MCP server connection and basic functionality",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Optional test message",
              default: "Hello MCP"
            }
          }
        }
      },
      {
        name: "get_status",
        description: "Get detailed server status and system information",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ];

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      stderr.write("[INFO] Tools requested\n");
      return { tools };
    });

    // Tool call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      stderr.write(`[INFO] Tool called: ${request.params.name}\n`);
      
      try {
        switch (request.params.name) {
          case "process_document": {
            if (!ragExtractorService || !DocumentParser) {
              return {
                content: [
                  {
                    type: "text",
                    text: `# Service Not Available ❌

**Error:** Tax processing services are not available.
**Reason:** Services failed to initialize or compile.

Please ensure:
1. Dependencies are installed: \`npm install\`
2. TypeScript is compiled: \`npm run build\`
3. Ollama is running (if using local AI): \`ollama serve\`

**Available in minimal mode:** test_connection, get_status`
                  }
                ]
              };
            }

            const args = request.params.arguments || {};
            const { filePath, fileName, context = "" } = args;

            if (!filePath || !fileName) {
              throw new Error("filePath and fileName are required");
            }

            // Create mock uploaded file object
            const mockFile = {
              path: filePath,
              originalname: fileName,
              mimetype: getMimeType(fileName),
              size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
            };

            // Validate file
            const documentParser = new DocumentParser();
            documentParser.validateFile(mockFile);

            // Parse document
            const documentText = await documentParser.parseDocument(mockFile);
            
            // Extract tax data
            const extractedData = await ragExtractorService.extractTaxData(documentText, context);

            return {
              content: [
                {
                  type: "text",
                  text: `# Document Processing Complete ✅

## Extracted Tax Data

**Company:** ${extractedData.taxpayerName}
**Tax Year:** ${extractedData.taxYear}
**Business Type:** ${extractedData.businessType}
**Tax ID:** ${extractedData.taxId}

## Financial Summary
- **Total Income:** $${extractedData.totalIncome.toLocaleString()}
- **Total Expenses:** $${extractedData.totalExpenses.toLocaleString()}
- **Total Deductions:** $${extractedData.totalDeductions.toLocaleString()}
- **Taxable Amount:** $${extractedData.taxableAmount.toLocaleString()}

## Document Info
- **File:** ${fileName}
- **Processing Status:** Successfully processed
- **AI Provider:** ${ragExtractorService.preferredProvider}

The document has been successfully processed and tax data extracted using AI analysis.`
                }
              ]
            };
          }

          case "generate_annual_report": {
            if (!ragExtractorService) {
              return {
                content: [
                  {
                    type: "text",
                    text: "# Service Not Available ❌\n\nRAG extractor service is not initialized."
                  }
                ]
              };
            }

            const args = request.params.arguments || {};
            const extractedData = {
              taxpayerName: args.taxpayerName || "Unknown",
              taxYear: args.taxYear || new Date().getFullYear(),
              totalIncome: args.totalIncome || 0,
              totalExpenses: args.totalExpenses || 0,
              totalDeductions: args.totalDeductions || 0,
              taxableAmount: args.taxableAmount || 0,
              taxId: args.taxId || "Not provided",
              businessType: args.businessType || "Not specified"
            };

            const report = await ragExtractorService.generateAnnualReport(extractedData);

            return {
              content: [
                {
                  type: "text",
                  text: report
                }
              ]
            };
          }

          case "get_ai_status": {
            if (!ragExtractorService) {
              return {
                content: [
                  {
                    type: "text",
                    text: `# AI Status ❌

**Service Status:** Not initialized
**Available Providers:** None
**Preferred Provider:** Not set

Please check server logs for initialization errors.`
                  }
                ]
              };
            }

            const isEnabled = ragExtractorService.isEnabled();
            const providers = ragExtractorService.getAvailableProviders();
            const connectionStatus = await ragExtractorService.testConnection();

            const statusText = Object.entries(connectionStatus)
              .map(([provider, status]) => `- **${provider.toUpperCase()}:** ${status ? '✅ Connected' : '❌ Disconnected'}`)
              .join('\n');

            return {
              content: [
                {
                  type: "text",
                  text: `# AI Provider Status

**Service Enabled:** ${isEnabled ? '✅ Yes' : '❌ No'}
**Preferred Provider:** ${ragExtractorService.preferredProvider}
**Available Providers:** ${providers.length > 0 ? providers.join(', ') : 'None'}

## Connection Status
${statusText}

${!isEnabled ? '\n**Note:** AI extraction is disabled. Using fallback extraction methods.' : ''}
${providers.length === 0 ? '\n**Recommendation:** Start Ollama with `ollama serve` to enable local AI processing.' : ''}`
                }
              ]
            };
          }

          case "validate_document": {
            if (!DocumentParser) {
              return {
                content: [
                  {
                    type: "text",
                    text: "# Service Not Available ❌\n\nDocument parser service is not initialized."
                  }
                ]
              };
            }

            const args = request.params.arguments || {};
            const { filePath, fileName } = args;

            if (!filePath || !fileName) {
              throw new Error("filePath and fileName are required");
            }

            // Create mock uploaded file object
            const mockFile = {
              path: filePath,
              originalname: fileName,
              mimetype: getMimeType(fileName),
              size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
            };

            try {
              const documentParser = new DocumentParser();
              documentParser.validateFile(mockFile);

              // Try to parse a small portion to verify readability
              const documentText = await documentParser.parseDocument(mockFile);
              const preview = documentText.substring(0, 200) + (documentText.length > 200 ? '...' : '');

              return {
                content: [
                  {
                    type: "text",
                    text: `# Document Validation ✅

**File:** ${fileName}
**Size:** ${(mockFile.size / 1024).toFixed(2)} KB
**Type:** ${mockFile.mimetype}
**Status:** Valid and readable

**Content Preview:**
\`\`\`
${preview}
\`\`\`

The document is ready for processing.`
                  }
                ]
              };
            } catch (validationError) {
              return {
                content: [
                  {
                    type: "text",
                    text: `# Document Validation ❌

**File:** ${fileName}
**Error:** ${validationError.message}

Please check:
- File format is supported (PDF, DOCX, XLSX, CSV)
- File is not corrupted
- File size is under 10MB
- File path is accessible`
                  }
                ]
              };
            }
          }

          case "test_connection": {
            const args = request.params.arguments || {};
            const message = args.message || "Hello MCP";
            
            return {
              content: [
                {
                  type: "text",
                  text: `# MCP Connection Test ✅

**Message:** ${message}
**Server:** gra-tax-processor
**Status:** Connected and working!
**Timestamp:** ${new Date().toISOString()}

**Services Status:**
- RAG Extractor: ${ragExtractorService ? '✅ Loaded' : '❌ Not loaded'}
- Document Parser: ${DocumentParser ? '✅ Loaded' : '❌ Not loaded'}

The MCP server is functioning correctly. JSON-RPC communication is working properly.`
                }
              ]
            };
          }

          case "get_status": {
            return {
              content: [
                {
                  type: "text",
                  text: `# Server Status

**Server Name:** gra-tax-processor
**Version:** 1.0.0
**Node Version:** ${process.version}
**Platform:** ${process.platform}
**Uptime:** ${process.uptime().toFixed(2)} seconds
**Memory Usage:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

**Available Tools:**
- process_document
- generate_annual_report  
- get_ai_status
- validate_document
- test_connection
- get_status

**Service Status:**
- RAG Extractor Service: ${ragExtractorService ? '✅ Active' : '❌ Inactive'}
- Document Parser: ${DocumentParser ? '✅ Active' : '❌ Inactive'}
- AI Providers: ${ragExtractorService ? ragExtractorService.getAvailableProviders().length : 0} available

✅ All systems operational!`
                }
              ]
            };
          }

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        stderr.write(`[ERROR] Tool execution failed: ${error.message}\n`);
        return {
          content: [
            {
              type: "text",
              text: `# Error ❌

**Tool:** ${request.params.name}
**Error:** ${error.message}

Please check the server logs for more details.`
            }
          ],
          isError: true
        };
      }
    });

    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    stderr.write("[INFO] GRA Tax Processor MCP server connected and ready!\n");
  } catch (error) {
    stderr.write(`[ERROR] Failed to start server: ${error.message}\n`);
    stderr.write(`[STACK] ${error.stack}\n`);
    process.exit(1);
  }
}

// Helper function to determine MIME type from filename
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Start the server
main().catch((error) => {
  stderr.write(`[FATAL] ${error.message}\n`);
  process.exit(1);
});
