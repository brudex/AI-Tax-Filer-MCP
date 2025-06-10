#!/bin/bash

# MCP Tools Test Script
# Tests all available tools in the GRA Tax Processor MCP server

echo "🧪 Testing GRA Tax Processor MCP Tools"
echo "=====================================\n"

MCP_SERVER="./mcp-minimal.cjs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test a tool
test_tool() {
    local tool_name=$1
    local params=$2
    local description=$3
    
    echo -e "${BLUE}Testing: ${tool_name}${NC}"
    echo -e "${YELLOW}Description: ${description}${NC}"
    
    local json_request="{\"jsonrpc\": \"2.0\", \"id\": $(date +%s), \"method\": \"tools/call\", \"params\": {\"name\": \"${tool_name}\", \"arguments\": ${params}}}"
    
    echo "$json_request" | $MCP_SERVER 2>/dev/null | tail -n 1 | jq '.result.content[0].text' -r 2>/dev/null || echo -e "${RED}❌ Test failed${NC}"
    echo -e "\n${YELLOW}---${NC}\n"
}

# Test 1: Basic Connection
echo -e "${GREEN}1. Testing Connection${NC}\n"
test_tool "test_connection" '{"message": "Testing MCP tools"}' "Basic server connectivity test"

# Test 2: Server Status
echo -e "${GREEN}2. Testing Server Status${NC}\n"
test_tool "get_status" '{}' "Get detailed server information"

# Test 3: AI Status
echo -e "${GREEN}3. Testing AI Provider Status${NC}\n"
test_tool "get_ai_status" '{}' "Check AI provider availability and connections"

# Test 4: Document Validation
echo -e "${GREEN}4. Testing Document Validation${NC}\n"
test_tool "validate_document" '{"filePath": "test_financial_statement.csv", "fileName": "test_financial_statement.csv"}' "Validate CSV document format"

# Test 5: Document Processing
echo -e "${GREEN}5. Testing Document Processing${NC}\n"
test_tool "process_document" '{"filePath": "test_financial_statement.csv", "fileName": "test_financial_statement.csv", "context": "Ghana Tech Solutions financial statement for tax processing"}' "Full AI-powered document processing"

# Test 6: Annual Report Generation
echo -e "${GREEN}6. Testing Annual Report Generation${NC}\n"
test_tool "generate_annual_report" '{"taxpayerName": "Ghana Tech Solutions Limited", "taxYear": 2023, "totalIncome": 1725000, "totalExpenses": 979000, "totalDeductions": 0, "taxableAmount": 415000, "taxId": "C0012345678", "businessType": "Technology Services"}' "Generate comprehensive annual financial report"

echo -e "${GREEN}✅ All tests completed!${NC}"
echo -e "${BLUE}Note: Check individual test outputs above for detailed results.${NC}" 