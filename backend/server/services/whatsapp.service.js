const https = require('https');
const { URL } = require('url');
const config = require('../config/config');

/**
 * Utility to sanitize & validate mobile number into country-code format (e.g., 919876543210)
 */
const formatPhoneNumber = (mobile) => {
  if (!mobile) {
    throw new Error('Mobile number is required');
  }

  // Convert to string and strip non-numeric characters
  let cleaned = String(mobile).replace(/\D/g, '');

  if (!cleaned) {
    throw new Error('Invalid mobile number format');
  }

  // Handle Indian 10-digit numbers (prepend 91)
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = `91${cleaned.slice(1)}`;
  }

  // Validate standard length (10 to 15 digits with country code)
  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new Error(`Mobile number '${mobile}' is invalid. Expected 10-15 digits with country code.`);
  }

  return cleaned;
};

/**
 * Redact sensitive auth keys from log outputs
 */
const sanitizeLog = (data) => {
  if (typeof data === 'string') {
    return data.replace(/([a-zA-Z0-9]{15,})/g, '***REDACTED***');
  }
  if (data && typeof data === 'object') {
    const copy = { ...data };
    if (copy.authkey) copy.authkey = '***REDACTED***';
    if (copy.headers && copy.headers.authkey) copy.headers.authkey = '***REDACTED***';
    return copy;
  }
  return data;
};

/**
 * Generic HTTPS Post Helper
 */
const makeHttpRequest = (targetUrl, headers, bodyData) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const postData = JSON.stringify(bodyData);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        let parsed = responseBody;
        try {
          parsed = JSON.parse(responseBody);
        } catch (e) {
          // Keep raw text if not JSON
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, data: parsed });
        } else {
          reject({
            statusCode: res.statusCode,
            data: parsed,
            message: `HTTP Error ${res.statusCode}: ${typeof parsed === 'object' ? JSON.stringify(parsed) : parsed}`
          });
        }
      });
    });

    req.on('error', (err) => {
      reject({ statusCode: 500, message: err.message, error: err });
    });

    req.write(postData);
    req.end();
  });
};

class WhatsAppService {

  /**
   * Core method to send WhatsApp Template Messages via MSG91 API
   */
  static async sendTemplateMessage(mobile, templateName, variables = {}, language = 'en') {
    const timestamp = new Date().toISOString();

    try {
      const formattedMobile = formatPhoneNumber(mobile);
      const authKey = config.MSG91_AUTH_KEY;
      const senderNumber = config.MSG91_WHATSAPP_NUMBER;
      const baseUrl = config.MSG91_BASE_URL || 'https://control.msg91.com/api/v5';

      if (!authKey) {
        throw new Error('MSG91_AUTH_KEY environment variable is not configured');
      }

      // Convert variables object into MSG91 template parameters array if object provided
      let bodyParameters = [];
      if (Array.isArray(variables)) {
        bodyParameters = variables.map(val => ({ type: 'text', text: String(val) }));
      } else if (variables && typeof variables === 'object') {
        bodyParameters = Object.values(variables).map(val => ({ type: 'text', text: String(val) }));
      }

      // MSG91 WhatsApp Outbound API Body Specification
      const payloadData = {
        integrated_number: senderNumber,
        content_type: 'template',
        payload: {
          to: formattedMobile,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: language,
              policy: 'deterministic'
            },
            components: [
              {
                type: 'body',
                parameters: bodyParameters
              }
            ]
          }
        }
      };

      const apiUrl = `${baseUrl.replace(/\/$/, '')}/whatsapp/whatsapp-outbound-message/`;
      const headers = {
        authkey: authKey
      };

      console.log(`[${timestamp}] [WhatsAppService] Sending template '${templateName}' to ${formattedMobile}...`);

      const response = await makeHttpRequest(apiUrl, headers, payloadData);
      
      const messageId = response.data?.messageId || response.data?.request_id || response.data?.data?.messageId || `MSG91-${Date.now()}`;

      console.log(`[${timestamp}] [WhatsAppService] SUCCESS -> Recipient: ${formattedMobile}, MessageID: ${messageId}`);

      return {
        success: true,
        message: 'WhatsApp message sent successfully',
        messageId,
        data: response.data
      };

    } catch (err) {
      const errorMsg = err.message || (err.data ? JSON.stringify(err.data) : 'Unknown MSG91 API error');
      console.error(`[${timestamp}] [WhatsAppService] FAILURE -> Recipient: ${mobile}, Error: ${errorMsg}`);

      return {
        success: false,
        message: 'Unable to send WhatsApp message',
        error: errorMsg,
        statusCode: err.statusCode || 500
      };
    }
  }

  /**
   * Wrapper: Send Appointment Reminder
   */
  static async sendAppointmentReminder(mobile, { patientName, doctorName, date, time }) {
    return this.sendTemplateMessage(mobile, 'appointment_reminder', {
      patientName: patientName || 'Patient',
      doctor: doctorName || 'Doctor',
      date: date || 'Today',
      time: time || 'Scheduled Time'
    });
  }

  /**
   * Wrapper: Send Invoice / Billing Details
   */
  static async sendInvoice(mobile, { patientName, invoiceNo, amount, downloadUrl }) {
    return this.sendTemplateMessage(mobile, 'invoice_receipt', {
      patientName: patientName || 'Valued Patient',
      invoiceNo: invoiceNo || 'N/A',
      amount: String(amount || 0),
      url: downloadUrl || 'N/A'
    });
  }

  /**
   * Wrapper: Send OTP Code
   */
  static async sendOTP(mobile, { otp, patientName }) {
    return this.sendTemplateMessage(mobile, 'otp_verification', {
      patientName: patientName || 'User',
      otp: String(otp)
    });
  }

  /**
   * Wrapper: Send Welcome Greetings
   */
  static async sendWelcomeMessage(mobile, { patientName, hospitalName }) {
    return this.sendTemplateMessage(mobile, 'welcome_message', {
      patientName: patientName || 'Patient',
      hospitalName: hospitalName || 'HIMS Clinic'
    });
  }

  /**
   * Wrapper: Send Custom / Flexible Template Message
   */
  static async sendCustomMessage(mobile, { templateName, messageText, variables }) {
    const vars = variables || (messageText ? { message: messageText } : {});
    const tmpl = templateName || 'custom_notification';
    return this.sendTemplateMessage(mobile, tmpl, vars);
  }
}

module.exports = {
  WhatsAppService,
  formatPhoneNumber
};
