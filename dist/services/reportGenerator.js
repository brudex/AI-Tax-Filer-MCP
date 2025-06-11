import { config } from '../config/config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import PDFDocument from 'pdfkit';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export class ReportGenerator {
    constructor() {
        this.reportsDir = config.files.report.outputDir;
        this.ensureReportsDirectory();
    }
    ensureReportsDirectory() {
        if (!fs.existsSync(this.reportsDir)) {
            fs.mkdirSync(this.reportsDir, { recursive: true });
        }
    }
    async generateReport(data, documentId) {
        return this.generateTaxReport(data, documentId || `DOC-${Date.now()}`);
    }
    async generateTaxReport(data, documentId) {
        try {
            const reportId = `REP-${Date.now()}`;
            const reportPath = path.join(this.reportsDir, `${reportId}.pdf`);
            // Create a new PDF document
            const doc = new PDFDocument({
                size: 'A4',
                margin: 50,
                info: {
                    Title: `Tax Report - ${data.taxpayerName}`,
                    Author: 'GRA Tax Processor',
                    Subject: 'Annual Tax Report',
                    Keywords: 'tax, report, gra, ghana',
                }
            });
            // Pipe the PDF to a write stream
            const stream = fs.createWriteStream(reportPath);
            doc.pipe(stream);
            // Add header
            doc.fontSize(24)
                .text('Ghana Revenue Authority', { align: 'center' })
                .fontSize(18)
                .text('Annual Tax Report', { align: 'center' })
                .moveDown();
            // Add report metadata
            doc.fontSize(10)
                .text(`Report ID: ${reportId}`)
                .text(`Generated: ${new Date().toLocaleString()}`)
                .text(`Document ID: ${documentId}`)
                .moveDown();
            // Add taxpayer information
            doc.fontSize(14)
                .text('Taxpayer Information', { underline: true })
                .moveDown(0.5)
                .fontSize(12);
            // Helper function to format field with data quality indicator
            const formatField = (label, value, isDefault) => {
                const indicator = isDefault ? '⚠️' : '✓';
                return `${label}: ${value} ${indicator}`;
            };
            // Add taxpayer fields with data quality indicators
            doc.text(formatField('Name', data.taxpayerName || 'Not provided', data.taxpayerName === 'Not provided'))
                .text(formatField('Tax ID', data.taxId || 'Not provided', data.taxId === 'Not provided'))
                .text(formatField('Business Type', data.businessType || 'Not specified', data.businessType === 'Not specified'))
                .text(formatField('Tax Year', data.taxYear, false))
                .moveDown();
            // Add financial summary
            doc.fontSize(14)
                .text('Financial Summary', { underline: true })
                .moveDown(0.5)
                .fontSize(12);
            // Format currency helper
            const formatCurrency = (amount) => {
                return `GHS ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };
            // Add financial fields with data quality indicators
            doc.text(formatField('Total Income', formatCurrency(data.totalIncome), data.totalIncome === 0))
                .text(formatField('Total Expenses', formatCurrency(data.totalExpenses), data.totalExpenses === 0))
                .text(formatField('Total Deductions', formatCurrency(data.totalDeductions), data.totalDeductions === 0))
                .text(formatField('Taxable Amount', formatCurrency(data.taxableAmount), data.taxableAmount === 0))
                .moveDown();
            // Add data quality legend
            doc.fontSize(10)
                .text('Data Quality Indicators:', { underline: true })
                .text('✓ - Data extracted from document')
                .text('⚠️ - Default or missing value')
                .moveDown();
            // Add footer
            const bottomMargin = doc.page.margins.bottom;
            doc.fontSize(10)
                .text('This is an automatically generated report. For official purposes, please verify with GRA.', doc.page.margins.left, doc.page.height - bottomMargin - 20, { align: 'center' });
            // Finalize the PDF
            doc.end();
            // Wait for the stream to finish
            await new Promise((resolve, reject) => {
                stream.on('finish', () => resolve());
                stream.on('error', reject);
            });
            // Verify the file exists
            if (!fs.existsSync(reportPath)) {
                throw new Error('Failed to generate PDF file');
            }
            console.log(`Generated PDF report at: ${reportPath}`);
            return {
                id: reportId,
                documentId,
                filePath: reportPath,
                generatedAt: new Date(),
                format: config.files.report.format,
                theme: config.files.report.theme,
                includeCharts: config.files.report.includeCharts
            };
        }
        catch (error) {
            console.error('Error generating report:', error);
            throw new Error(`Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
