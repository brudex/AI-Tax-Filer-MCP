import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load environment variables
dotenv.config();
export const config = {
    // Server Configuration
    server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development',
        uploadDir: process.env.UPLOAD_DIR || '../uploads',
        reportDir: process.env.REPORT_DIR || '../reports'
    },
    // MongoDB Configuration
    database: {
        mongoUri: process.env.MONGODB_URL || 'mongodb://localhost:27017/gra_tax_processor',
        dbName: process.env.MONGODB_DB_NAME || 'gra_tax_processor',
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        }
    },
    // AI Configuration
    ai: {
        preferredProvider: process.env.AI_PROVIDER || 'ollama',
        ollama: {
            enabled: true,
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            model: process.env.OLLAMA_MODEL || 'mistral'
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-4',
            enabled: !!process.env.OPENAI_API_KEY
        },
        claude: {
            apiKey: process.env.CLAUDE_API_KEY,
            model: process.env.CLAUDE_MODEL || 'claude-2',
            enabled: !!process.env.CLAUDE_API_KEY
        }
    },
    // File Configuration
    files: {
        upload: {
            maxSize: process.env.MAX_FILE_SIZE || 10 * 1024 * 1024, // 10MB
            allowedTypes: [
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/csv'
            ]
        },
        report: {
            format: process.env.DEFAULT_REPORT_FORMAT || 'pdf',
            theme: process.env.DEFAULT_REPORT_THEME || 'gra-official',
            includeCharts: process.env.INCLUDE_CHARTS === 'true',
            tempDir: path.join(__dirname, '../../temp'),
            outputDir: path.join(__dirname, '../../reports')
        }
    },
    // Document Processing Configuration
    processing: {
        maxFileSize: process.env.MAX_FILE_SIZE || 10 * 1024 * 1024, // 10MB
        allowedFileTypes: [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
        ],
    },
    // Security Configuration
    security: {
        corsOrigin: process.env.CORS_ORIGIN || '*',
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // limit each IP to 100 requests per windowMs
    },
};
// Remove default export to avoid confusion
// export default config; 
