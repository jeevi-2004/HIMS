const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the parent backend folder (.env)
dotenv.config({ path: path.join(__dirname, '../../.env') });

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb+srv://jeevithavillzone_db_user:uDQWYc2aAfC68L299@hims.lusmhsf.mongodb.net/villzone_platform?appName=HIMS',
  JWT_SECRET: process.env.JWT_SECRET || 'villzone_hims_jwt_secret_key_2026_super_secure_auth',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '24h',
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_ENV: process.env.APP_ENV || 'PROD',
  MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY || '',
  MSG91_WHATSAPP_NUMBER: process.env.MSG91_WHATSAPP_NUMBER || '',
  MSG91_BASE_URL: process.env.MSG91_BASE_URL || 'https://control.msg91.com/api/v5',
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || '',
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'eastus',
  GOOGLE_TTS_API_KEY: process.env.GOOGLE_TTS_API_KEY || '',
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  SARVAM_API_KEY: process.env.SARVAM_API_KEY || '',
  SARVAM_TTS_MODEL: process.env.SARVAM_TTS_MODEL || 'bulbul:v3'
};
