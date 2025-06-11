import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { config } from './config/config.js';
import router from './routes/index.js';
import { ragExtractorService } from './services/ragExtractorService.js';
import { mongoService } from './services/mongoService.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Initialize express app
const app = express();
// Security middleware
app.use(helmet());
// Enable CORS based on environment
const isDevelopment = config.server.environment === 'development';
if (isDevelopment) {
    app.use(cors());
}
else {
    app.use(cors({
        origin: config.security.corsOrigin
    }));
}
// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: {
        fileSize: typeof config.files.upload.maxSize === 'string'
            ? parseInt(config.files.upload.maxSize, 10)
            : config.files.upload.maxSize
    },
    fileFilter: (req, file, cb) => {
        if (config.files.upload.allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type'));
        }
    }
});
// Ensure required directories exist
const ensureDirectories = () => {
    const directories = [
        path.join(__dirname, '../uploads'),
        path.join(__dirname, '../reports'),
        config.files.report.tempDir,
        config.files.report.outputDir
    ];
    directories.forEach((dir) => {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    });
};
// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});
// Static file serving
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/reports', express.static(path.join(__dirname, '../reports')));
app.use('/api/reports/download', express.static(config.files.report.outputDir));
// Health check endpoint
app.get('/api/health', async (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        aiStatus: {
            enabled: ragExtractorService.isEnabled(),
            providers: ragExtractorService.getAvailableProviders()
        }
    });
});
// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'MCP Server for Annual Tax Report Generation',
        description: 'Ghana Revenue Authority Tax Document Processing Server',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            documentation: '/api/api-docs',
            upload: '/api/upload',
            documents: '/api/documents',
            reports: '/api/reports',
        },
        status: 'running',
        timestamp: new Date().toISOString(),
    });
});
// API routes
app.use('/api', router);
// Global error handling middleware
app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        ...(isDevelopment && { stack: error.stack }),
        timestamp: new Date().toISOString(),
    });
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: {
            root: '/',
            health: '/api/health',
            documentation: '/api/api-docs',
            upload: '/api/upload',
            documents: '/api/documents',
            reports: '/api/reports',
        },
    });
});
// Initialize server
const startServer = async () => {
    let server = null;
    try {
        // Ensure directories exist
        ensureDirectories();
        // Initialize MongoDB
        console.log('🔄 Initializing MongoDB...');
        try {
            await mongoService.initializeConnection();
            console.log('✅ MongoDB initialized successfully');
        }
        catch (error) {
            console.error('❌ Failed to initialize MongoDB:', error);
            process.exit(1);
        }
        // Initialize RAG extractor with proper error handling
        try {
            await ragExtractorService.initialize();
            const providers = ragExtractorService.getAvailableProviders();
            if (providers.length > 0) {
                console.log('✅ RAG Extractor initialized successfully');
                console.log(`🤖 Available AI providers: ${providers.join(', ')}`);
            }
            else {
                console.log('⚠️  No AI providers available - server will run in manual mode');
                console.log('   To enable AI features, please ensure:');
                console.log('   1. Ollama is running (if using Ollama)');
                console.log('   2. OpenAI API key is set (if using OpenAI)');
                console.log('   3. Claude API key is set (if using Claude)');
            }
        }
        catch (error) {
            console.error('Failed to initialize RAG Extractor:', {
                message: error instanceof Error ? error.message : String(error),
                details: error instanceof Error ? { ...error } : undefined,
                stack: error instanceof Error ? error.stack : undefined
            });
            console.log('⚠️  Server will continue in manual mode without AI features');
        }
        // Start server with port retry logic
        let currentPort = Number(config.server.port);
        const maxRetries = 10;
        while (currentPort < Number(config.server.port) + maxRetries) {
            try {
                server = app.listen(currentPort, () => {
                    console.log('🚀 Starting MCP Server...');
                    console.log(`📄 Environment: ${config.server.environment}`);
                    console.log(`🌍 Port: ${currentPort}`);
                    console.log(`📁 Upload Directory: ${path.join(__dirname, '../uploads')}`);
                    console.log(`📊 Report Directory: ${path.join(__dirname, '../reports')}`);
                    console.log(`🤖 AI Provider: ${config.ai.preferredProvider}`);
                    console.log('✅ Server is ready!');
                });
                break;
            }
            catch (error) {
                if (error.code === 'EADDRINUSE' && currentPort < Number(config.server.port) + maxRetries) {
                    console.log(`Port ${currentPort} is in use, trying next port...`);
                    currentPort++;
                }
                else {
                    throw error;
                }
            }
        }
        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            console.log(`\n${signal} received. Shutting down gracefully...`);
            if (server) {
                server.close(() => {
                    console.log('✅ HTTP server closed.');
                });
            }
            try {
                await mongoService.close();
                console.log('✅ MongoDB connection closed');
            }
            catch (error) {
                console.error('❌ Error during MongoDB shutdown:', error);
            }
            // Add a small delay to allow logs to be written
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log('👋 Goodbye!');
            process.exit(0);
        };
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
// Export for testing
export { app };
// Error handling for uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', {
        promise,
        reason: reason instanceof Error ? {
            ...reason,
            stack: reason.stack
        } : reason
    });
    if (isDevelopment) {
        process.exit(1);
    }
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', {
        ...error,
        stack: error.stack
    });
    process.exit(1);
});
// Start server if not in test environment
if (import.meta.url === `file://${process.argv[1]}`) {
    startServer();
}
