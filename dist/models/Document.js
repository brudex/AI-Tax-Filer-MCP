import mongoose from 'mongoose';
const documentSchema = new mongoose.Schema({
    documentId: {
        type: String,
        required: true,
        unique: true
    },
    filename: {
        type: String,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'processing', 'completed', 'error'],
        default: 'pending'
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    // Extracted data as nested object (how mongoService saves it)
    extractedData: {
        taxpayerName: String,
        taxYear: Number,
        totalIncome: Number,
        totalExpenses: Number,
        totalDeductions: Number,
        taxableAmount: Number,
        taxId: String,
        businessType: String
    },
    // Individual fields for backward compatibility
    taxpayerName: String,
    taxYear: Number,
    totalIncome: Number,
    totalExpenses: Number,
    totalDeductions: Number,
    taxableAmount: Number,
    taxId: String,
    businessType: String,
    extractionMethod: {
        type: String,
        default: 'manual'
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});
// Indexes
documentSchema.index({ documentId: 1 });
documentSchema.index({ taxpayerName: 'text', taxId: 'text', businessType: 'text' });
documentSchema.index({ taxYear: 1 });
documentSchema.index({ uploadedAt: 1 });
// Virtual for formatted amounts (works with both nested and flat structure)
documentSchema.virtual('formattedTotalIncome').get(function () {
    const income = this.totalIncome || this.extractedData?.totalIncome;
    return income ? `GHS ${income.toLocaleString()}` : 'N/A';
});
documentSchema.virtual('formattedTotalExpenses').get(function () {
    const expenses = this.totalExpenses || this.extractedData?.totalExpenses;
    return expenses ? `GHS ${expenses.toLocaleString()}` : 'N/A';
});
documentSchema.virtual('formattedTaxableAmount').get(function () {
    const taxable = this.taxableAmount || this.extractedData?.taxableAmount;
    return taxable ? `GHS ${taxable.toLocaleString()}` : 'N/A';
});
// Methods
documentSchema.methods.updateStatus = function (status) {
    this.status = status;
    return this.save();
};
documentSchema.methods.updateExtractedData = function (data) {
    // Update both nested and flat structures for compatibility
    this.extractedData = data;
    Object.assign(this, {
        taxpayerName: data.taxpayerName,
        taxYear: data.taxYear,
        totalIncome: data.totalIncome,
        totalExpenses: data.totalExpenses,
        totalDeductions: data.totalDeductions,
        taxableAmount: data.taxableAmount,
        taxId: data.taxId,
        businessType: data.businessType
    });
    return this.save();
};
// Statics
documentSchema.statics.findByTaxYear = function (year) {
    return this.find({ taxYear: year });
};
documentSchema.statics.findByDateRange = function (startDate, endDate) {
    return this.find({
        uploadedAt: {
            $gte: startDate,
            $lte: endDate
        }
    });
};
documentSchema.statics.searchDocuments = function (query) {
    return this.find({
        $text: { $search: query }
    });
};
// Export the model
export const Document = mongoose.model('Document', documentSchema);
