import { Request, Response } from 'express';
import { ReportGenerator } from '../services/reportGenerator.js';
import { mongoService } from '../services/mongoService.js';
import { ExtractedTaxData } from '../types/index.js';
import fs from 'fs';

export class ReportController {
  private reportGenerator: ReportGenerator;

  constructor() {
    this.reportGenerator = new ReportGenerator();
  }

  public generateReport = async (req: Request, res: Response) => {
    try {
      const { documentId } = req.body;

      // Get document data
      const extractedData = await mongoService.getExtractedData(documentId);
      if (!extractedData) {
        return res.status(404).json({
          success: false,
          error: 'Document not found or data not extracted'
        });
      }

      // Generate report
      const report = await this.reportGenerator.generateTaxReport(extractedData, documentId);

      // Save report to database
      await mongoService.saveReport(
        report.id,
        documentId,
        'completed',
        report.filePath
      );

      res.json({
        success: true,
        report: {
          id: report.id,
          documentId,
          filePath: report.filePath,
          generatedAt: report.generatedAt,
          format: report.format,
          theme: report.theme,
          includeCharts: report.includeCharts
        }
      });
    } catch (error) {
      console.error('Report generation error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  public getReports = async (req: Request, res: Response) => {
    try {
      const reports = await mongoService.getAllReports();
      res.json({ success: true, reports });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  public getReport = async (req: Request, res: Response) => {
    try {
      const report = await mongoService.getReport(req.params.reportId);
      if (!report) {
        return res.status(404).json({
          success: false,
          error: 'Report not found'
        });
      }
      res.json({ success: true, report });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  public deleteReport = async (req: Request, res: Response) => {
    try {
      await mongoService.deleteReport(req.params.reportId);
      res.json({
        success: true,
        message: 'Report deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  public downloadReport = async (req: Request, res: Response) => {
    try {
      const { reportId } = req.params;
      const report = await mongoService.getReport(reportId);

      if (!report) {
        return res.status(404).json({
          success: false,
          error: 'Report not found'
        });
      }

      if (!report.filePath || !fs.existsSync(report.filePath)) {
        return res.status(404).json({
          success: false,
          error: 'Report file not found'
        });
      }

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=tax-report-${reportId}.pdf`);

      // Stream the file
      const fileStream = fs.createReadStream(report.filePath);
      fileStream.pipe(res);

      // Handle errors
      fileStream.on('error', (error) => {
        console.error('Error streaming report file:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to download report'
          });
        }
      });
    } catch (error) {
      console.error('Error downloading report:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
} 