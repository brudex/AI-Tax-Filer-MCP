import { DocumentParser } from '../services/documentParser.js';
import { mongoService } from '../services/mongoService.js';
import { generateUniqueId } from '../utils/index.js';
import { ragExtractorService } from '../services/ragExtractorService.js';
export class UploadController {
    constructor() {
        this.uploadDocument = async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'No document uploaded'
                    });
                }
                const file = req.file;
                console.log(`[${new Date().toISOString()}] POST /api/upload - IP: ${req.ip}`);
                // Generate document ID
                const documentId = generateUniqueId();
                console.log(`Processing document ${documentId}...`);
                try {
                    // Validate and parse document
                    this.documentParser.validateFile(file);
                    const documentText = await this.documentParser.parseDocument(file);
                    console.log(`Document parsed successfully. Text length: ${documentText.length}`);
                    // Extract tax data using AI if available
                    const ragExtractor = ragExtractorService.getExtractor();
                    let extractedData;
                    let extractionMethod = 'manual';
                    if (ragExtractor) {
                        try {
                            console.log(`Attempting AI extraction for document ${documentId}...`);
                            extractedData = await ragExtractor.extractTaxData(documentText);
                            // Check if meaningful data was extracted
                            const hasData = Object.entries(extractedData).some(([key, value]) => {
                                if (typeof value === 'string') {
                                    return value !== 'Not provided' && value !== 'Not specified';
                                }
                                if (typeof value === 'number') {
                                    return value !== 0;
                                }
                                return false;
                            });
                            if (hasData) {
                                console.log(`Successfully extracted data for document ${documentId}:`, JSON.stringify(extractedData, null, 2));
                                extractionMethod = 'ai';
                            }
                            else {
                                console.log(`No meaningful data extracted for document ${documentId}, using default structure`);
                                extractedData = {
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
                        }
                        catch (error) {
                            console.warn('Failed to extract tax data:', error);
                            extractedData = {
                                taxpayerName: 'Not provided',
                                taxYear: new Date().getFullYear(),
                                totalIncome: 0,
                                totalExpenses: 0,
                                totalDeductions: 0,
                                taxableAmount: 0,
                                taxId: 'Not provided',
                                businessType: 'Not specified'
                            };
                            console.log(`Using default tax data structure for document ${documentId}`);
                        }
                    }
                    else {
                        console.log('AI extraction not available, using default tax data structure');
                        extractedData = {
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
                    // Save to database with extraction method
                    await mongoService.saveDocument(documentId, file.originalname, 'completed', extractedData, extractionMethod);
                    console.log(`Document ${documentId} saved to database (extraction method: ${extractionMethod})`);
                    return res.json({
                        success: true,
                        message: 'Document uploaded and processed successfully.',
                        data: {
                            documentId,
                            filename: file.originalname,
                            status: 'completed',
                            extractedData,
                            extractionMethod,
                            aiAvailable: !!ragExtractor,
                            dataQuality: {
                                hasName: extractedData.taxpayerName !== 'Not provided',
                                hasTaxId: extractedData.taxId !== 'Not provided',
                                hasBusinessType: extractedData.businessType !== 'Not specified',
                                hasFinancialData: extractedData.totalIncome > 0 || extractedData.totalExpenses > 0
                            }
                        }
                    });
                }
                finally {
                    // Clean up uploaded file
                    try {
                        await DocumentParser.cleanupFile(file.path);
                    }
                    catch (error) {
                        console.warn('Failed to cleanup file:', error);
                    }
                }
            }
            catch (error) {
                console.error('Error processing document:', error);
                return res.status(500).json({
                    success: false,
                    message: `Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        };
        this.getDocuments = async (req, res) => {
            try {
                const { query, year, startDate, endDate } = req.query;
                let documents;
                if (query) {
                    documents = await mongoService.searchDocuments(query);
                }
                else if (year) {
                    documents = await mongoService.getDocumentsByYear(Number(year));
                }
                else if (startDate && endDate) {
                    documents = await mongoService.getDocumentsByDateRange(startDate, endDate);
                }
                else {
                    documents = await mongoService.getAllDocuments();
                }
                return res.json({
                    success: true,
                    message: 'Documents retrieved successfully',
                    data: documents
                });
            }
            catch (error) {
                console.error('Error retrieving documents:', error);
                return res.status(500).json({
                    success: false,
                    message: `Failed to retrieve documents: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        };
        this.getDocumentStatus = async (req, res) => {
            try {
                const { documentId } = req.params;
                const document = await mongoService.getDocument(documentId);
                if (!document) {
                    return res.status(404).json({
                        success: false,
                        message: 'Document not found'
                    });
                }
                console.log(`Document ${documentId} status:`, JSON.stringify(document, null, 2));
                return res.json({
                    success: true,
                    message: 'Document status retrieved',
                    data: document
                });
            }
            catch (error) {
                console.error('Error retrieving document status:', error);
                return res.status(500).json({
                    success: false,
                    message: `Failed to retrieve document status: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        };
        this.getExtractedData = async (req, res) => {
            try {
                const { documentId } = req.params;
                const extractedData = await mongoService.getExtractedData(documentId);
                if (!extractedData) {
                    return res.status(404).json({
                        success: false,
                        message: 'Document not found or data not extracted'
                    });
                }
                return res.json({
                    success: true,
                    message: 'Extracted data retrieved successfully',
                    data: extractedData
                });
            }
            catch (error) {
                console.error('Error retrieving extracted data:', error);
                return res.status(500).json({
                    success: false,
                    message: `Failed to retrieve extracted data: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        };
        this.documentParser = new DocumentParser();
    }
}
