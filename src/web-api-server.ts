import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ragExtractorService } from './services/ragExtractorService.js';
import { DocumentParser } from './services/documentParser.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for development - restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static('./public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv', // Additional CSV mimetype
      'text/plain', // For .txt files and CSV files sometimes detected as plain text
      'application/octet-stream' // For files that can't be detected properly
    ];
    
    console.log(`📁 File filter - Name: ${file.originalname}, MimeType: ${file.mimetype}`);
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.error(`❌ File rejected - MimeType: ${file.mimetype} not in allowed types: ${allowedTypes.join(', ')}`);
      cb(new Error('Invalid file type. Only PDF, DOCX, XLSX, XLS, and CSV files are allowed.'));
    }
  }
});

// Helper function to format API responses
const formatResponse = (success: boolean, data?: any, error?: string) => {
  return {
    success,
    timestamp: new Date().toISOString(),
    ...(data && { data }),
    ...(error && { error })
  };
};

// Initialize services
async function initializeServices() {
  try {
    console.log('🔄 Initializing AI services...');
    await ragExtractorService.initialize();
    console.log('✅ AI services initialized successfully');
  } catch (error) {
    console.warn('⚠️  AI services initialization failed:', error);
    console.log('🔄 Server will run in limited mode');
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.json(formatResponse(true, {
    name: 'GRA Tax Processor Web API',
    version: '1.0.0',
    description: 'Web API for AI-powered tax document processing',
    endpoints: {
      status: 'GET /api/status',
      aiStatus: 'GET /api/ai-status',
      testConnection: 'GET /api/test',
      validateDocument: 'POST /api/validate-document',
      processDocument: 'POST /api/process-document',
      generateReport: 'POST /api/generate-report'
    }
  }));
});

// API Routes

// 1. Server Status
app.get('/api/status', (req, res) => {
  const memoryUsage = process.memoryUsage();
  
  res.json(formatResponse(true, {
    server: 'gra-tax-processor-web-api',
    version: '1.0.0',
    status: 'operational',
    uptime: `${process.uptime().toFixed(2)} seconds`,
    nodeVersion: process.version,
    platform: process.platform,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    },
    services: {
      ragExtractor: ragExtractorService.isEnabled() ? 'active' : 'inactive',
      documentParser: 'active',
      aiProviders: ragExtractorService.getAvailableProviders().length
    }
  }));
});

// 2. AI Status Check
app.get('/api/ai-status', async (req, res) => {
  try {
    const isEnabled = ragExtractorService.isEnabled();
    const providers = ragExtractorService.getAvailableProviders();
    const connectionStatus = await ragExtractorService.testConnection();

    res.json(formatResponse(true, {
      enabled: isEnabled,
      preferredProvider: ragExtractorService.preferredProvider,
      availableProviders: providers,
      connections: connectionStatus
    }));
  } catch (error) {
    res.status(500).json(formatResponse(false, null, `Failed to check AI status: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
});

// 3. Test Connection
app.get('/api/test', (req, res) => {
  const message = req.query.message as string || 'Hello from Web API';
  
  res.json(formatResponse(true, {
    message,
    server: 'gra-tax-processor-web-api',
    status: 'connected',
    timestamp: new Date().toISOString(),
    services: {
      ragExtractor: ragExtractorService ? 'loaded' : 'not loaded',
      documentParser: 'loaded'
    }
  }));
});

// 4. Validate Document
app.post('/api/validate-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(formatResponse(false, null, 'No file uploaded'));
    }

    const documentParser = new DocumentParser();
    
    // Create file object for validation
    const fileObj = {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      destination: req.file.destination,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    };

    // Validate file
    documentParser.validateFile(fileObj);

    // Parse a preview of the document
    const documentText = await documentParser.parseDocument(fileObj);
    const preview = documentText.substring(0, 300) + (documentText.length > 300 ? '...' : '');

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json(formatResponse(true, {
      fileName: req.file.originalname,
      fileSize: `${(req.file.size / 1024).toFixed(2)} KB`,
      mimeType: req.file.mimetype,
      status: 'valid',
      preview,
      readyForProcessing: true
    }));
  } catch (error) {
    // Clean up file if validation fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(400).json(formatResponse(false, null, error instanceof Error ? error.message : 'Validation failed'));
  }
});

// 5. Process Document (Main AI Processing)
app.post('/api/process-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(formatResponse(false, null, 'No file uploaded'));
    }

    const context = req.body.context || '';
    const documentParser = new DocumentParser();
    
    // Create file object
    const fileObj = {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      destination: req.file.destination,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    };

    // Validate and parse document
    documentParser.validateFile(fileObj);
    const documentText = await documentParser.parseDocument(fileObj);

    console.log('Document text:>>>>>>>>>>>', documentText);
    console.log('Context:>>>>>>>>>>>', context);
    
    // Extract tax data using AI
    const extractedData = await ragExtractorService.extractTaxData(documentText, context);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json(formatResponse(true, {
      fileName: req.file.originalname,
      fileSize: `${(req.file.size / 1024).toFixed(2)} KB`,
      processingStatus: 'completed',
      aiProvider: ragExtractorService.preferredProvider,
      extractedData: {
        taxpayerName: extractedData.taxpayerName,
        taxYear: extractedData.taxYear,
        businessType: extractedData.businessType,
        taxId: extractedData.taxId,
        financialSummary: {
          totalIncome: extractedData.totalIncome,
          totalExpenses: extractedData.totalExpenses,
          totalDeductions: extractedData.totalDeductions,
          taxableAmount: extractedData.taxableAmount
        }
      }
    }));
  } catch (error) {
    // Clean up file if processing fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json(formatResponse(false, null, `Document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
});

// 6. Generate Annual Report
app.post('/api/generate-report', async (req, res) => {
  try {
    const {
      taxpayerName,
      taxYear,
      totalIncome,
      totalExpenses,
      totalDeductions,
      taxableAmount,
      taxId,
      businessType
    } = req.body;

    // Validate required fields
    if (!taxpayerName || !taxYear || totalIncome === undefined || totalExpenses === undefined || taxableAmount === undefined) {
      return res.status(400).json(formatResponse(false, null, 'Missing required fields: taxpayerName, taxYear, totalIncome, totalExpenses, taxableAmount'));
    }

    const extractedData = {
      taxpayerName: taxpayerName || "Unknown",
      taxYear: parseInt(taxYear) || new Date().getFullYear(),
      totalIncome: parseFloat(totalIncome) || 0,
      totalExpenses: parseFloat(totalExpenses) || 0,
      totalDeductions: parseFloat(totalDeductions) || 0,
      taxableAmount: parseFloat(taxableAmount) || 0,
      taxId: taxId || "Not provided",
      businessType: businessType || "Not specified"
    };

    const report = await ragExtractorService.generateAnnualReport(extractedData);

    res.json(formatResponse(true, {
      reportGenerated: true,
      reportLength: `${report.length} characters`,
      aiProvider: ragExtractorService.preferredProvider,
      report
    }));
  } catch (error) {
    res.status(500).json(formatResponse(false, null, `Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
  }
});

// 7. Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json(formatResponse(false, null, 'File too large. Maximum size is 10MB.'));
    }
    return res.status(400).json(formatResponse(false, null, `Upload error: ${error.message}`));
  }
  
  res.status(500).json(formatResponse(false, null, 'Internal server error'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json(formatResponse(false, null, `Endpoint not found: ${req.method} ${req.originalUrl}`));
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    app.listen(PORT, () => {
      console.log(`
🚀 GRA Tax Processor Web API Server Started!
  
📍 Server running on: http://localhost:${PORT}
🔧 Environment: ${process.env.NODE_ENV || 'development'}
💾 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

📋 Available Endpoints:
  • GET  /                     - API information
  • GET  /api/status           - Server status
  • GET  /api/ai-status        - AI providers status  
  • GET  /api/test             - Connection test
  • POST /api/validate-document - Validate document
  • POST /api/process-document  - Process & extract data
  • POST /api/generate-report   - Generate annual report
  • GET  /health               - Health check

🤖 AI Services: ${ragExtractorService.isEnabled() ? '✅ Active' : '❌ Inactive'}
🔌 Providers: ${ragExtractorService.getAvailableProviders().join(', ') || 'None'}

Ready to process tax documents! 📊
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 