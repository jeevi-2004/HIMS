const { WhatsAppService, formatPhoneNumber } = require('../services/whatsapp.service');

/**
 * Controller to send a generic WhatsApp template message
 * POST /api/whatsapp/send-template
 */
const sendTemplate = async (req, res, next) => {
  try {
    const { mobile, templateName, variables, language } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
        error: 'Missing required field: mobile'
      });
    }

    if (!templateName) {
      return res.status(400).json({
        success: false,
        message: 'Template name is required',
        error: 'Missing required field: templateName'
      });
    }

    // Validate phone number format
    try {
      formatPhoneNumber(mobile);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format',
        error: valErr.message
      });
    }

    const result = await WhatsAppService.sendTemplateMessage(
      mobile,
      templateName,
      variables || {},
      language || 'en'
    );

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        message: result.message || 'Unable to send WhatsApp',
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp message sent successfully',
      messageId: result.messageId,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to send custom / notification message
 * POST /api/whatsapp/send-custom
 */
const sendCustom = async (req, res, next) => {
  try {
    const { mobile, templateName, messageText, variables } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
        error: 'Missing required field: mobile'
      });
    }

    if (!messageText && !templateName && !variables) {
      return res.status(400).json({
        success: false,
        message: 'Message content or template details required',
        error: 'Provide messageText, templateName, or variables payload'
      });
    }

    try {
      formatPhoneNumber(mobile);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format',
        error: valErr.message
      });
    }

    const result = await WhatsAppService.sendCustomMessage(mobile, {
      templateName,
      messageText,
      variables
    });

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        message: result.message || 'Unable to send WhatsApp',
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp sent successfully',
      messageId: result.messageId,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to send OTP verification code
 * POST /api/whatsapp/send-otp
 */
const sendOTP = async (req, res, next) => {
  try {
    const { mobile, otp, patientName } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
        error: 'Missing required field: mobile'
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP is required',
        error: 'Missing required field: otp'
      });
    }

    try {
      formatPhoneNumber(mobile);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format',
        error: valErr.message
      });
    }

    const result = await WhatsAppService.sendOTP(mobile, { otp, patientName });

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        message: result.message || 'Unable to send OTP via WhatsApp',
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp sent successfully',
      messageId: result.messageId,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to send billing / invoice receipt
 * POST /api/whatsapp/send-invoice
 */
const sendInvoice = async (req, res, next) => {
  try {
    const { mobile, patientName, invoiceNo, amount, downloadUrl } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
        error: 'Missing required field: mobile'
      });
    }

    if (!invoiceNo || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Invoice number and amount are required',
        error: 'Missing required fields: invoiceNo or amount'
      });
    }

    try {
      formatPhoneNumber(mobile);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format',
        error: valErr.message
      });
    }

    const result = await WhatsAppService.sendInvoice(mobile, {
      patientName,
      invoiceNo,
      amount,
      downloadUrl
    });

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        message: result.message || 'Unable to send Invoice via WhatsApp',
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp sent successfully',
      messageId: result.messageId,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to send appointment reminder
 * POST /api/whatsapp/send-reminder
 */
const sendReminder = async (req, res, next) => {
  try {
    const { mobile, patientName, doctorName, date, time } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
        error: 'Missing required field: mobile'
      });
    }

    try {
      formatPhoneNumber(mobile);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format',
        error: valErr.message
      });
    }

    const result = await WhatsAppService.sendAppointmentReminder(mobile, {
      patientName,
      doctorName,
      date,
      time
    });

    if (!result.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        message: result.message || 'Unable to send Appointment Reminder via WhatsApp',
        error: result.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'WhatsApp sent successfully',
      messageId: result.messageId,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendTemplate,
  sendCustom,
  sendOTP,
  sendInvoice,
  sendReminder
};
