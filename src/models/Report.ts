import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    required: true,
    unique: true
  },
  documentId: {
    type: String,
    required: true,
    ref: 'Document'
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'error'],
    default: 'pending'
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  filePath: {
    type: String,
    required: true
  },
  format: {
    type: String,
    enum: ['pdf', 'html', 'docx'],
    default: 'pdf'
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
reportSchema.index({ reportId: 1 });
reportSchema.index({ documentId: 1 });
reportSchema.index({ generatedAt: 1 });

// Virtual for document reference
reportSchema.virtual('document', {
  ref: 'Document',
  localField: 'documentId',
  foreignField: 'documentId',
  justOne: true
});

// Methods
reportSchema.methods.updateStatus = function(status: string) {
  this.status = status;
  return this.save();
};

reportSchema.methods.setFilePath = function(filePath: string) {
  this.filePath = filePath;
  return this.save();
};

// Statics
reportSchema.statics.findByDocument = function(documentId: string) {
  return this.find({ documentId }).populate('document');
};

reportSchema.statics.findByDateRange = function(startDate: Date, endDate: Date) {
  return this.find({
    generatedAt: {
      $gte: startDate,
      $lte: endDate
    }
  }).populate('document');
};

reportSchema.statics.getRecentReports = function(limit = 10) {
  return this.find()
    .sort({ generatedAt: -1 })
    .limit(limit)
    .populate('document');
};

// Pre-save middleware
reportSchema.pre('save', function(next) {
  if (this.isNew) {
    this.generatedAt = new Date();
  }
  next();
});

// Export the model
export const Report = mongoose.model('Report', reportSchema); 