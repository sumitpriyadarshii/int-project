const express = require('express');
const router = express.Router();
const Discussion = require('../models/Discussion');
const Dataset = require('../models/Dataset');
const User = require('../models/User');
const ContentFlag = require('../models/ContentFlag');
const AuditLog = require('../models/AuditLog');
const { protect, optionalAuth } = require('../middleware/auth');
const { enforceNoPII } = require('../utils/piiGuard');

const logAudit = async (payload) => {
  try {
    await AuditLog.create(payload);
  } catch (error) {
    console.error('Audit log failed:', error.message);
  }
};

// @route   GET /api/discussions/dataset/:datasetId
router.get('/dataset/:datasetId', optionalAuth, async (req, res) => {
  try {
    const { type, sort = '-createdAt', page = 1, limit = 20 } = req.query;
    const query = { dataset: req.params.datasetId };
    if (type) query.type = type;
    if (!(req.user && req.user.role === 'admin')) {
      query.isDeleted = { $ne: true };
    }

    const total = await Discussion.countDocuments(query);
    const discussions = await Discussion.find(query)
      .populate('author', 'username avatar reputation role discussionProfileAccess')
      .populate('replies.author', 'username avatar role discussionProfileAccess')
      .populate('deletedBy', 'username role')
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({ success: true, discussions, total });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch discussions' });
  }
});

// @route   PATCH /api/discussions/:id
router.patch('/:id', protect, enforceNoPII(['title', 'content']), async (req, res) => {
  try {
    const { title, content, type, priority, tags } = req.body;
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });

    const isOwner = discussion.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (discussion.isDeleted && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Deleted discussions cannot be edited' });
    }

    if (typeof title === 'string') discussion.title = title;
    if (typeof content === 'string') discussion.content = content;
    if (typeof type === 'string') discussion.type = type;
    if (typeof priority === 'string') discussion.priority = priority;
    if (Array.isArray(tags)) discussion.tags = tags;

    await discussion.save();
    await discussion.populate('author', 'username avatar reputation role discussionProfileAccess');
    await discussion.populate('replies.author', 'username avatar role discussionProfileAccess');
    await discussion.populate('deletedBy', 'username role');

    res.json({ success: true, discussion, message: 'Discussion updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update discussion' });
  }
});

// @route   POST /api/discussions
router.post('/', protect, enforceNoPII(['title', 'content']), async (req, res) => {
  try {
    const { datasetId, title, content, type, priority, tags } = req.body;

    const dataset = await Dataset.findById(datasetId);
    if (!dataset) return res.status(404).json({ success: false, message: 'Dataset not found' });

    const discussion = await Discussion.create({
      dataset: datasetId,
      author: req.user._id,
      title, content, type, priority,
      tags: tags || []
    });

    await discussion.populate('author', 'username avatar reputation role discussionProfileAccess');

    const io = req.app.get('io');
    if (io) {
      io.to(`dataset:${datasetId}`).emit('discussion_added', {
        datasetId,
        discussion
      });
    }

    // Notify dataset contributor
    if (dataset.contributor.toString() !== req.user._id.toString()) {
      await User.findByIdAndUpdate(dataset.contributor, {
        $push: {
          notifications: {
            type: 'new_discussion',
            message: `${req.user.username} started a discussion on "${dataset.title}"`,
            link: `/datasets/${datasetId}`,
            read: false
          }
        }
      });
    }

    res.status(201).json({ success: true, discussion, message: 'Discussion created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create discussion' });
  }
});

// @route   POST /api/discussions/:id/reply
router.post('/:id/reply', protect, enforceNoPII(['content']), async (req, res) => {
  try {
    const { content, parentReplyId } = req.body;
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });

    let replyDepth = 0;
    let normalizedParentReplyId = null;

    if (parentReplyId) {
      const parentReply = discussion.replies.find((reply) => reply._id.toString() === parentReplyId);
      if (!parentReply) {
        return res.status(400).json({ success: false, message: 'Parent reply not found' });
      }
      normalizedParentReplyId = parentReply._id;
      replyDepth = Math.min((parentReply.depth || 0) + 1, 3);
    }

    discussion.replies.push({
      author: req.user._id,
      content,
      parentReplyId: normalizedParentReplyId,
      depth: replyDepth
    });
    await discussion.save();
    await discussion.populate('author', 'username avatar reputation role discussionProfileAccess');
    await discussion.populate('replies.author', 'username avatar role discussionProfileAccess');
    await discussion.populate('deletedBy', 'username role');

    const io = req.app.get('io');
    if (io) {
      io.to(`dataset:${discussion.dataset.toString()}`).emit('reply_added', {
        datasetId: discussion.dataset.toString(),
        discussion
      });
    }

    // Notify discussion author
    if (discussion.author.toString() !== req.user._id.toString()) {
      await User.findByIdAndUpdate(discussion.author, {
        $push: {
          notifications: {
            type: 'new_reply',
            message: req.user.role === 'admin'
              ? 'An admin replied to your discussion'
              : `${req.user.username} replied to your discussion`,
            read: false
          }
        }
      });
    }

    res.json({ success: true, discussion, message: 'Reply added' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add reply' });
  }
});

// @route   POST /api/discussions/:id/flag
router.post('/:id/flag', protect, enforceNoPII(['details']), async (req, res) => {
  try {
    const { reason = 'other', details = '' } = req.body;
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });

    discussion.flagStatus = 'open';
    discussion.flagReason = reason;
    discussion.flagDetails = details;
    await discussion.save();

    await ContentFlag.create({
      targetType: 'discussion',
      targetId: discussion._id,
      dataset: discussion.dataset,
      reporter: req.user._id,
      reason,
      details
    });

    await logAudit({
      dataset: discussion.dataset,
      actor: req.user._id,
      action: 'flag_created',
      summary: `Flagged discussion ${discussion._id}`,
      metadata: { reason, details }
    });

    res.status(201).json({ success: true, message: 'Discussion flagged for review' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to flag discussion' });
  }
});

// @route   POST /api/discussions/:id/vote
router.post('/:id/vote', protect, async (req, res) => {
  try {
    const { vote } = req.body; // 'up' or 'down'
    const discussion = await Discussion.findById(req.params.id);

    if (vote === 'up') {
      const hasVoted = discussion.upvotes.includes(req.user._id);
      if (hasVoted) {
        await Discussion.findByIdAndUpdate(req.params.id, { $pull: { upvotes: req.user._id } });
      } else {
        await Discussion.findByIdAndUpdate(req.params.id, {
          $push: { upvotes: req.user._id },
          $pull: { downvotes: req.user._id }
        });
      }
    } else {
      const hasVoted = discussion.downvotes.includes(req.user._id);
      if (hasVoted) {
        await Discussion.findByIdAndUpdate(req.params.id, { $pull: { downvotes: req.user._id } });
      } else {
        await Discussion.findByIdAndUpdate(req.params.id, {
          $push: { downvotes: req.user._id },
          $pull: { upvotes: req.user._id }
        });
      }
    }

    const updated = await Discussion.findById(req.params.id);
    res.json({
      success: true,
      voteScore: updated.upvotes.length - updated.downvotes.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to vote' });
  }
});

// @route   PUT /api/discussions/:id/status
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const discussion = await Discussion.findById(req.params.id).populate('dataset');

    if (discussion.author.toString() !== req.user._id.toString() &&
        discussion.dataset.contributor.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    discussion.status = status;
    if (status === 'in_review') discussion.flagStatus = 'reviewed';
    if (status === 'verified') discussion.flagStatus = 'action_taken';
    await discussion.save();
    await logAudit({
      dataset: discussion.dataset._id || discussion.dataset,
      actor: req.user._id,
      action: 'issue_updated',
      summary: `Discussion ${discussion._id} marked ${status}`,
      metadata: { status }
    });
    res.json({ success: true, message: `Discussion marked as ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// @route   DELETE /api/discussions/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });

    const isOwner = discussion.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    discussion.isDeleted = true;
    discussion.deletedAt = new Date();
    discussion.deletedBy = req.user._id;
    await discussion.save();
    await logAudit({
      dataset: discussion.dataset,
      actor: req.user._id,
      action: 'discussion_deleted',
      summary: `Deleted discussion ${discussion._id}`
    });

    res.json({ success: true, message: 'Discussion deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete discussion' });
  }
});

module.exports = router;
