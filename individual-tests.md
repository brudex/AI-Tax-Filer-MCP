# Individual MCP Tool Testing Guide

## 🔧 Basic Tools

### Test Connection
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "test_connection", "arguments": {"message": "Hello from test"}}}' | ./mcp-minimal.cjs
```

### Get Server Status
```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_status", "arguments": {}}}' | ./mcp-minimal.cjs
```

### Check AI Provider Status
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_ai_status", "arguments": {}}}' | ./mcp-minimal.cjs
```

## 📄 Document Processing Tools

### Validate Document
```bash
echo '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "validate_document", "arguments": {"filePath": "test_financial_statement.csv", "fileName": "test_financial_statement.csv"}}}' | ./mcp-minimal.cjs
```

### Process Document (Full AI Processing)
```bash
echo '{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "process_document", "arguments": {"filePath": "test_financial_statement.csv", "fileName": "test_financial_statement.csv", "context": "Financial statement for tax processing"}}}' | ./mcp-minimal.cjs
```

### Generate Annual Report
```bash
echo '{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "generate_annual_report", "arguments": {"taxpayerName": "Ghana Tech Solutions Limited", "taxYear": 2023, "totalIncome": 1725000, "totalExpenses": 979000, "totalDeductions": 0, "taxableAmount": 415000, "taxId": "C0012345678", "businessType": "Technology Services"}}}' | ./mcp-minimal.cjs
```

## 📝 List All Available Tools
```bash
echo '{"jsonrpc": "2.0", "id": 0, "method": "tools/list", "params": {}}' | ./mcp-minimal.cjs
```

## 🚀 Initialize Server
```bash
echo '{"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | ./mcp-minimal.cjs
```

## 📊 Testing Different Document Types

### Create a PDF test (if you have PDFs)
```bash
echo '{"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "validate_document", "arguments": {"filePath": "path/to/your/document.pdf", "fileName": "document.pdf"}}}' | ./mcp-minimal.cjs
```

### Create an Excel test (if you have Excel files)
```bash
echo '{"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "process_document", "arguments": {"filePath": "path/to/your/spreadsheet.xlsx", "fileName": "spreadsheet.xlsx"}}}' | ./mcp-minimal.cjs
```

## 🔍 Debugging Tips

1. **Check server logs**: Look at stderr output for detailed error messages
2. **Verify file paths**: Ensure document paths are correct and accessible
3. **Test AI connectivity**: Use `get_ai_status` to verify Ollama/OpenAI/Claude connections
4. **Validate first**: Always use `validate_document` before `process_document`

## 🎯 Expected Outputs

- **Success**: JSON response with `result.content[0].text` containing formatted results
- **Error**: JSON response with `isError: true` and error message
- **Server logs**: Detailed processing information in stderr (prefixed with [LOG], [INFO], [WARN], [ERROR]) 