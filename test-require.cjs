// Test require syntax
try {
  console.log('Testing server import...');
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  console.log('Server imported successfully:', typeof Server);
  
  console.log('Testing transport import...');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  console.log('Transport imported successfully:', typeof StdioServerTransport);
  
  console.log('Testing types import...');
  const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
  console.log('Types imported successfully:', typeof CallToolRequestSchema, typeof ListToolsRequestSchema);
  
  console.log('All imports successful!');
} catch (error) {
  console.error('Import failed:', error.message);
  console.error('Stack:', error.stack);
} 