const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  message: { type: String, required: true },
  link: { type: String, default: '' },
  attachmentName: { type: String, default: '' },
  attachmentUrl: { type: String, default: '' },
  attachmentSize: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Announcement', announcementSchema);