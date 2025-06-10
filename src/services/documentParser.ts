import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import { parse } from 'csv-parse/sync';
import { UploadedFile } from '../types/index.js';

export class DocumentParser {
  /**
   * Parse uploaded document and extract text content
   */
  async parseDocument(file: UploadedFile): Promise<string> {
    try {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      switch (fileExtension) {
        case '.pdf':
          return await this.parsePDF(file.path);
        case '.docx':
          return await this.parseWord(file.path);
        case '.xlsx':
        case '.xls':
          return await this.parseExcel(file.path);
        case '.csv':
          return await this.parseCSV(file.path);
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }
    } catch (error) {
      console.error('Document parsing error:', error);
      throw new Error(`Failed to parse document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse PDF document
   */
  private async parsePDF(filePath: string): Promise<string> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      
      if (!data.text || data.text.trim().length === 0) {
        throw new Error('No text content found in PDF');
      }
      
      console.log('Parsed PDF content:', data.text); // Debug log
      
      return this.cleanText(data.text);
    } catch (error) {
      console.error('PDF parsing failed:', error);
      throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse Word document (.docx)
   */
  private async parseWord(filePath: string): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      if (!result.value || result.value.trim().length === 0) {
        throw new Error('No text content found in Word document');
      }
      
      if (result.messages && result.messages.length > 0) {
        console.warn('Word document parsing warnings:', result.messages);
      }
      
      return this.cleanText(result.value);
    } catch (error) {
      throw new Error(`Word document parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse Excel document
   */
  private async parseExcel(filePath: string): Promise<string> {
    try {
      const workbook = xlsx.readFile(filePath);
      let text = '';

      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const sheetData = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 });

        // Add sheet name as header
        text += `Sheet: ${sheetName}\n\n`;

        // Convert rows to text
        for (const row of sheetData) {
          if (row && row.length > 0) {
            text += row.join('\t') + '\n';
          }
        }
        text += '\n---\n\n';
      }

      return this.cleanText(text);
    } catch (error) {
      throw new Error(`Excel parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse CSV document
   */
  private async parseCSV(filePath: string): Promise<string> {
    try {
      const fileContent = fs.readFileSync(filePath);
      const records: string[][] = parse(fileContent, {
        skip_empty_lines: true,
        trim: true
      });

      // Convert records to text
      const text = records
        .map((row: string[]) => row.join('\t'))
        .join('\n');

      return this.cleanText(text);
    } catch (error) {
      throw new Error(`CSV parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean and normalize extracted text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Remove excessive line breaks
      .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Validate file before processing
   */
  validateFile(file: UploadedFile): void {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`Invalid file type. Allowed types: PDF, DOCX, XLSX, CSV`);
    }

    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size: ${maxSize / 1024 / 1024}MB`);
    }

    if (!fs.existsSync(file.path)) {
      throw new Error('File not found');
    }
  }

  /**
   * Clean up uploaded files
   */
  static async cleanupFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to cleanup file ${filePath}:`, error);
    }
  }
} 