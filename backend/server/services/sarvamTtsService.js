const config = require('../config/config');
const { SARVAM_TAMIL_VOICES } = require('./sarvamVoiceCatalog');
const TtsUsageLog = require('../models/TtsUsageLog');

/**
 * Sarvam AI Text-to-Speech Service for Tamil (ta-IN)
 * Connects securely from backend Node/Express server using SARVAM_API_KEY.
 * Endpoint: https://api.sarvam.ai/text-to-speech
 */
class SarvamTtsService {
  constructor() {
    this.apiKey = config.SARVAM_API_KEY;
    this.model = config.SARVAM_TTS_MODEL || 'bulbul:v3';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getVoiceCatalog() {
    return SARVAM_TAMIL_VOICES;
  }

  /**
   * Synthesizes Tamil text using Sarvam AI REST API (Bulbul v3 model).
   * @param {Object} options { text, voiceId, pace, hospitalId }
   * @returns {Promise<Buffer>} Audio Buffer (WAV/MP3)
   */
  async synthesizeSpeech({ text, voiceId = 'kavitha', pace = 1.0, hospitalId = null }) {
    if (!this.isConfigured()) {
      throw new Error('Sarvam AI API Key (SARVAM_API_KEY) is not configured on the backend server.');
    }

    if (!text || !text.trim()) {
      throw new Error('Tamil text is required for Sarvam synthesis.');
    }

    const endpoint = 'https://api.sarvam.ai/text-to-speech';
    const targetSpeaker = voiceId || 'kavitha';
    const targetPace = parseFloat(pace || 1.0);

    const payload = {
      inputs: [text.trim()],
      target_language_code: 'ta-IN',
      speaker: targetSpeaker,
      pace: targetPace,
      speech_sample_rate: 16000,
      enable_preprocessing: true,
      model: this.model
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'api-subscription-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[SARVAM TTS API ERROR ${response.status}]:`, errText);
      throw new Error(`Sarvam AI Synthesis failed [HTTP ${response.status}]: ${errText}`);
    }

    const data = await response.json();
    if (!data.audios || !data.audios[0]) {
      throw new Error('Sarvam AI response did not contain audio payload.');
    }

    // Convert base64 audio string to Buffer
    const audioBuffer = Buffer.from(data.audios[0], 'base64');

    // Asynchronously log multi-tenant character usage tracking
    try {
      await TtsUsageLog.create({
        hospitalId: hospitalId || null,
        provider: 'sarvam',
        language: 'ta-IN',
        voiceId: targetSpeaker,
        characterCount: text.trim().length,
        announcementCount: 1
      });
    } catch (logErr) {
      console.warn('[SARVAM TTS USAGE LOG] Warning logging character count:', logErr.message);
    }

    return audioBuffer;
  }
}

module.exports = new SarvamTtsService();
