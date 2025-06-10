import { MongoClient, Collection, Db } from 'mongodb';
import { config } from '../config/config.js';
import { ExtractedTaxData } from '../types/index.js';

class MongoService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isConnecting: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private static instance: MongoService | null = null;

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): MongoService {
    if (!MongoService.instance) {
      MongoService.instance = new MongoService();
    }
    return MongoService.instance;
  }

  public async initializeConnection(): Promise<void> {
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        console.log('Connecting to MongoDB...');
        if (!config.database?.mongoUri) {
          throw new Error('MongoDB URI not configured');
        }
        
        console.log('MongoDB Config:', {
          uri: config.database.mongoUri,
          dbName: config.database.dbName,
          options: config.database.options
        });

        this.client = new MongoClient(config.database.mongoUri, config.database.options);
        
        console.log('Attempting to connect...');
        await this.client.connect();
        console.log('Connected to MongoDB server');
        
        this.db = this.client.db(config.database.dbName);
        console.log('Selected database:', config.database.dbName);
        
        // Test the connection
        await this.db.command({ ping: 1 });
        console.log('✅ MongoDB connection test successful');
        
        resolve();
      } catch (error) {
        console.error('❌ MongoDB connection error:', {
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error,
          config: {
            uri: config.database?.mongoUri,
            dbName: config.database?.dbName,
            options: config.database?.options
          }
        });
        this.client = null;
        this.db = null;
        reject(error);
      } finally {
        this.isConnecting = false;
      }
    });

    return this.connectionPromise;
  }

  private async getCollection(name: string): Promise<Collection> {
    if (!this.db) {
      await this.initializeConnection();
      if (!this.db) {
        throw new Error('Failed to connect to MongoDB');
      }
    }
    return this.db.collection(name);
  }

  public async close(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
        console.log('✅ MongoDB connection closed');
      }
    } catch (error) {
      console.error('❌ Error closing MongoDB connection:', error);
      throw error;
    }
  }

  async saveDocument(
    documentId: string,
    filename: string,
    status: string,
    extractedData: ExtractedTaxData,
    extractionMethod: string = 'manual'
  ): Promise<void> {
    try {
      const collection = await this.getCollection('documents');
      await collection.insertOne({
        documentId,
        filename,
        status,
        extractedData, // Keep nested for new structure
        extractionMethod,
        uploadedAt: new Date(),
        updatedAt: new Date(),
        // Also flatten for backward compatibility with existing queries
        ...extractedData
      });
      console.log(`✅ Document ${documentId} saved to MongoDB`); 
    } catch (error) {
      console.error('❌ Error saving document to MongoDB:', error);
      throw new Error(`Failed to save document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDocument(documentId: string) {
    try {
      const collection = await this.getCollection('documents');
      return await collection.findOne({ documentId });
    } catch (error) {
      console.error('❌ Error retrieving document:', error);
      throw new Error(`Failed to retrieve document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAllDocuments() {
    try {
      const collection = await this.getCollection('documents');
      return await collection.find().toArray();
    } catch (error) {
      console.error('❌ Error retrieving all documents:', error);
      throw new Error(`Failed to retrieve documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDocumentsByYear(year: number) {
    try {
      const collection = await this.getCollection('documents');
      return await collection.find({
        'extractedData.taxYear': year
      }).toArray();
    } catch (error) {
      console.error('❌ Error retrieving documents by year:', error);
      throw new Error(`Failed to retrieve documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getDocumentsByDateRange(startDate: string, endDate: string) {
    try {
      const collection = await this.getCollection('documents');
      return await collection.find({
        uploadedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }).toArray();
    } catch (error) {
      console.error('❌ Error retrieving documents by date range:', error);
      throw new Error(`Failed to retrieve documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchDocuments(query: string) {
    try {
      const collection = await this.getCollection('documents');
      return await collection.find({
        $or: [
          { 'extractedData.taxpayerName': { $regex: query, $options: 'i' } },
          { 'extractedData.taxId': { $regex: query, $options: 'i' } },
          { filename: { $regex: query, $options: 'i' } }
        ]
      }).toArray();
    } catch (error) {
      console.error('❌ Error searching documents:', error);
      throw new Error(`Failed to search documents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getExtractedData(documentId: string): Promise<ExtractedTaxData | null> {
    try {
      const collection = await this.getCollection('documents');
      const document = await collection.findOne({ documentId });
      return document?.extractedData || null;
    } catch (error) {
      console.error('❌ Error retrieving extracted data:', error);
      throw new Error(`Failed to retrieve extracted data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async saveReport(reportId: string, documentId: string, status: string, filePath: string) {
    try {
      const collection = await this.getCollection('reports');
      await collection.insertOne({
        reportId,
        documentId,
        status,
        filePath,
        generatedAt: new Date()
      });
      console.log(`✅ Report ${reportId} saved to MongoDB`);
    } catch (error) {
      console.error('❌ Error saving report:', error);
      throw new Error(`Failed to save report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getReport(reportId: string) {
    try {
      const collection = await this.getCollection('reports');
      return await collection.findOne({ reportId });
    } catch (error) {
      console.error('❌ Error retrieving report:', error);
      throw new Error(`Failed to retrieve report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAllReports() {
    try {
      const collection = await this.getCollection('reports');
      return await collection.find().toArray();
    } catch (error) {
      console.error('❌ Error retrieving all reports:', error);
      throw new Error(`Failed to retrieve reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteReport(reportId: string) {
    try {
      const collection = await this.getCollection('reports');
      await collection.deleteOne({ reportId });
      console.log(`✅ Report ${reportId} deleted from MongoDB`);
    } catch (error) {
      console.error('❌ Error deleting report:', error);
      throw new Error(`Failed to delete report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const mongoService = MongoService.getInstance(); 