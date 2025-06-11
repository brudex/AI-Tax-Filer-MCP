import express from 'express';
import { upload } from '../middleware/upload.js';
import { mongoService } from '../services/mongoService.js';
import { DocumentParser } from '../services/documentParser.js';
import { ragExtractorService } from '../services/ragExtractorService.js';
import { ReportGenerator } from '../services/reportGenerator.js';
const router = express.Router();
const documentParser = new DocumentParser();
const reportGenerator = new ReportGenerator();
// Document upload and processing
router.post('/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }
        // Validate and parse document
        documentParser.validateFile(req.file);
        const documentText = await documentParser.parseDocument(req.file);
        // Extract tax data using AI
        const extractedData = await ragExtractorService.extractTaxData(documentText);
        // Save document to database
        const documentId = `DOC-${Date.now()}`;
        await mongoService.saveDocument(documentId, req.file.originalname, 'processing', extractedData);
        // Generate report
        const report = await reportGenerator.generateTaxReport(extractedData, documentId);
        await mongoService.saveReport(`REP-${Date.now()}`, documentId, 'completed', report.filePath);
        res.json({
            success: true,
            documentId,
            extractedData,
            reportPath: report.filePath
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get all documents
router.get('/documents', async (req, res) => {
    try {
        const documents = await mongoService.getAllDocuments();
        res.json({ success: true, documents });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get single document
router.get('/documents/:id', async (req, res) => {
    try {
        const document = await mongoService.getDocument(req.params.id);
        if (!document) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }
        res.json({ success: true, document });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get all reports
router.get('/reports', async (req, res) => {
    try {
        const reports = await mongoService.getAllReports();
        res.json({ success: true, reports });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get single report
router.get('/reports/:id', async (req, res) => {
    try {
        const report = await mongoService.getReport(req.params.id);
        if (!report) {
            return res.status(404).json({
                success: false,
                error: 'Report not found'
            });
        }
        res.json({ success: true, report });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Search documents
router.get('/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }
        const results = await mongoService.searchDocuments(query);
        res.json({ success: true, results });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Get documents by year
router.get('/documents/year/:year', async (req, res) => {
    try {
        const year = parseInt(req.params.year);
        if (isNaN(year)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid year'
            });
        }
        const documents = await mongoService.getDocumentsByYear(year);
        res.json({ success: true, documents });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Debug endpoint
router.get('/debug/db', async (req, res) => {
    try {
        const documents = await mongoService.getAllDocuments();
        const reports = await mongoService.getAllReports();
        res.json({
            success: true,
            documents,
            reports,
            counts: {
                documents: documents.length,
                reports: reports.length
            }
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
export default router;
