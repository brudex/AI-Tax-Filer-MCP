# MCP Server for Annual Tax Report Generation

A TypeScript/Node.js MCP (Model Context Protocol) server that processes PDF and Word documents, extracts financial data using AI, and generates professional tax reports for the Ghana Revenue Authority (GRA).

## 🚀 Features

- **📄 Document Processing**: Support for PDF and Word (.docx) documents
- **🤖 Dual AI Integration**: Uses OpenAI GPT or Claude (Anthropic) for data extraction
- **🔄 AI Fallback System**: Automatic fallback between providers for reliability
- **📊 PDF Report Generation**: Creates professional tax reports with GRA formatting
- **🔒 Secure File Handling**: Proper validation, size limits, and cleanup
- **🌐 RESTful API**: Complete API with comprehensive error handling
- **📖 Self-Documenting**: Built-in API documentation endpoint

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js + TypeScript |
| **Framework** | Express.js |
| **Document Parsing** | pdf-parse, mammoth |
| **AI/NLP** | OpenAI API (GPT) + Claude (Anthropic) |
| **PDF Generation** | PDFKit |
| **File Upload** | Multer |
| **Security** | Helmet, CORS |

## 📋 Prerequisites

- Node.js (v18+ recommended)
- npm or yarn
- OpenAI API key and/or Claude API key (for AI features)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the environment template and configure:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# AI Provider (choose one or both)
AI_PROVIDER=auto  # Options: 'openai', 'claude', or 'auto'

# At least one API key is required for AI features
OPENAI_API_KEY=your_openai_api_key_here
CLAUDE_API_KEY=your_claude_api_key_here

# Optional model overrides
OPENAI_MODEL=gpt-3.5-turbo
CLAUDE_MODEL=claude-3-haiku-20240307
```

### 3. Build and Run

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

The server will start on `http://localhost:3000`

## 🤖 AI Provider Configuration

The server supports multiple AI providers with automatic fallback:

### **Provider Options**
- **`auto`** (default): Try all available providers with fallback
- **`openai`**: Prefer OpenAI, fallback to Claude if available
- **`claude`**: Prefer Claude, fallback to OpenAI if available

### **Supported Models**
- **OpenAI**: `gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo`
- **Claude**: `claude-3-haiku-20240307`, `claude-3-sonnet-20240229`, `claude-3-opus-20240229`

### **Cost Considerations**
- **Recommended for development**: Claude Haiku (fast, cheap)
- **Recommended for production**: GPT-3.5-turbo or Claude Sonnet (balanced)
- **High accuracy needs**: GPT-4 or Claude Opus (expensive but most accurate)

## 📖 API Documentation

### Health Check
```http
GET /api/health
```

### AI Status Check
```http
GET /api/ai-status
```
Returns information about available AI providers and their connection status.

### Upload Document
```http
POST /api/upload
Content-Type: multipart/form-data

# Form data:
document: [PDF or DOCX file]
```

### Get Document Status
```http
GET /api/documents/:documentId
```

### Get Extracted Data
```http
GET /api/documents/:documentId/data
```

### Generate Report
```http
POST /api/generate-report
Content-Type: application/json

{
  "documentId": "uuid",
  "data": {
    "totalIncome": 50000,
    "totalExpenses": 10000,
    "totalDeductions": 5000,
    "taxableAmount": 45000,
    "taxYear": 2024,
    "taxpayerName": "John Doe",
    "taxId": "GHA123456789"
  },
  "options": {
    "format": "pdf",
    "theme": "gra-official"
  }
}
```

### Download Report
```http
GET /api/reports/:reportId/download
```

## 💡 Usage Examples

### Check AI Status
```bash
curl http://localhost:3000/api/ai-status
```

### Using cURL

1. **Upload a document:**
```bash
curl -X POST \
  -F "document=@financial_statement.pdf" \
  http://localhost:3000/api/documents/upload
```

2. **Check processing status:**
```bash
curl http://localhost:3000/api/documents/{documentId}
```

3. **Generate report:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"documentId":"uuid","data":{...}}' \
  http://localhost:3000/api/generate-report
```

### Frontend Integration Example

```javascript
// Check AI status first
const aiStatus = await fetch('/api/ai-status');
const aiData = await aiStatus.json();
console.log('Available AI providers:', aiData.data.availableProviders);

// Upload document
const formData = new FormData();
formData.append('document', fileInput.files[0]);

const uploadResponse = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});

const uploadResult = await uploadResponse.json();
const documentId = uploadResult.data.documentId;

// Poll for completion
const checkStatus = async () => {
  const response = await fetch(`/api/documents/${documentId}`);
  const result = await response.json();
  
  if (result.data.status === 'completed') {
    // Get extracted data
    const dataResponse = await fetch(`/api/documents/${documentId}/data`);
    const extractedData = await dataResponse.json();
    
    // Generate report
    const reportResponse = await fetch('/api/generate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId,
        data: extractedData.data
      })
    });
    
    const reportResult = await reportResponse.json();
    const reportId = reportResult.data.reportId;
    
    // Download report
    window.open(`/api/reports/${reportId}/download`);
  } else {
    setTimeout(checkStatus, 2000); // Check again in 2 seconds
  }
};

checkStatus();
```

## 🏗️ Project Structure

```
src/
├── config/           # Configuration files
├── controllers/      # API controllers
├── middleware/       # Express middleware
├── routes/          # Route definitions
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Main application entry point

uploads/             # Uploaded documents (temporary)
reports/             # Generated PDF reports
```

## 🔧 Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `AI_PROVIDER` | AI provider preference | `auto` |
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `OPENAI_MODEL` | OpenAI model | `gpt-3.5-turbo` |
| `CLAUDE_API_KEY` | Claude API key | Optional |
| `CLAUDE_MODEL` | Claude model | `claude-3-haiku-20240307` |
| `MAX_FILE_SIZE` | Max upload size (bytes) | `10485760` (10MB) |
| `UPLOAD_DIR` | Upload directory | `./uploads` |
| `REPORT_OUTPUT_DIR` | Report output directory | `./reports` |

## 🔒 Security Features

- File type validation (PDF, DOCX only)
- File size limits
- CORS protection
- Security headers (Helmet)
- Input validation and sanitization
- Automatic file cleanup

## 🧪 Development

### Available Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm start          # Start production server
npm run watch      # Watch mode for development
npm test           # Run tests
```

### Development Workflow

1. Make changes to TypeScript files in `src/`
2. The dev server will automatically restart
3. Test your changes using the API endpoints
4. Build for production when ready

## 📝 API Response Format

All API responses follow this format:

```json
{
  "success": boolean,
  "message": string,
  "data": any,      // Optional
  "error": string,  // Optional, only on errors
  "timestamp": string
}
```

## 🚨 Error Handling

The server includes comprehensive error handling:

- **400**: Bad Request (invalid input, file validation errors)
- **404**: Not Found (document/report not found)
- **500**: Internal Server Error (processing failures)

## 🔄 AI Provider Fallback

The system automatically handles AI provider failures:

1. **Primary Provider**: Based on `AI_PROVIDER` setting
2. **Fallback**: If primary fails, tries other available providers
3. **Graceful Degradation**: Returns structured template if all AI fails
4. **Logging**: Detailed logs for debugging provider issues

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For issues and questions:

1. Check the API documentation: `GET /api/api-docs`
2. Check AI status: `GET /api/ai-status`
3. Review the logs for error details
4. Ensure at least one AI API key is properly configured
5. Verify file formats are supported (PDF, DOCX)

## 🔮 Future Enhancements

- [ ] OCR support for scanned PDFs
- [ ] Multiple tax jurisdiction support
- [ ] Batch processing capabilities
- [ ] Database persistence
- [ ] User authentication
- [ ] Report templates customization
- [ ] Real-time processing status via WebSockets
- [ ] Additional AI providers (Gemini, local models)
- [ ] Advanced AI prompt engineering interface 