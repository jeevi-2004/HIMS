/**
 * VillZone HIMS — Workflow API Routes (Phase 5)
 * SSE Real-Time Stream, Event History, & Announcement Settings Endpoints.
 */

const express = require('express');
const router = express.Router();
const WorkflowEventHub = require('../services/WorkflowEventHub');

let announcementSettings = {
  mode: 'Token + Patient Name + Doctor', // 'Token Only' | 'Patient Name Only' | 'Token + Patient Name' | 'Token + Patient Name + Doctor'
  language: 'en-US', // 'en-US' | 'ta-IN' | 'hi-IN'
  voiceGender: 'Female', // 'Female' | 'Male'
  speed: 1.0, // 0.8 | 1.0 | 1.2
  repeatCount: 1
};

// 1. SSE Real-Time Stream
router.get('/events/stream', (req, res) => {
  WorkflowEventHub.addClient(req, res);
});

// 2. Event History
router.get('/events/history', (req, res) => {
  res.json({
    success: true,
    data: WorkflowEventHub.getEventHistory()
  });
});

// 3. Get Announcement Settings
router.get('/announcement-settings', (req, res) => {
  res.json({
    success: true,
    data: announcementSettings
  });
});

// 4. Update Announcement Settings
router.put('/announcement-settings', (req, res) => {
  announcementSettings = { ...announcementSettings, ...req.body };
  res.json({
    success: true,
    message: 'Announcement settings updated successfully',
    data: announcementSettings
  });
});

// 5. Trigger Remote Voice Call
router.post('/events/trigger-call', (req, res) => {
  const payload = req.body;
  WorkflowEventHub.publish('TriggerVoiceCall', payload);
  res.json({
    success: true,
    message: 'Voice call triggered successfully'
  });
});

module.exports = router;
