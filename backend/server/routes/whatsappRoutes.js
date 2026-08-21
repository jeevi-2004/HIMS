const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  sendTemplate,
  sendCustom,
  sendOTP,
  sendInvoice,
  sendReminder
} = require('../controllers/whatsapp.controller');

// All WhatsApp routes are protected by auth middleware
router.use(protect);

/**
 * @route   POST /api/whatsapp/send-template
 * @desc    Send a template message via MSG91 WhatsApp API
 * @access  Private
 */
router.post('/send-template', sendTemplate);

/**
 * @route   POST /api/whatsapp/send-custom
 * @desc    Send a custom text or flexible template message via WhatsApp
 * @access  Private
 */
router.post('/send-custom', sendCustom);

/**
 * @route   POST /api/whatsapp/send-otp
 * @desc    Send an OTP code via WhatsApp
 * @access  Private
 */
router.post('/send-otp', sendOTP);

/**
 * @route   POST /api/whatsapp/send-invoice
 * @desc    Send invoice/billing receipt notification via WhatsApp
 * @access  Private
 */
router.post('/send-invoice', sendInvoice);

/**
 * @route   POST /api/whatsapp/send-reminder
 * @desc    Send appointment reminder notification via WhatsApp
 * @access  Private
 */
router.post('/send-reminder', sendReminder);

module.exports = router;
