const config = require('../config/config');

/**
 * Google Cloud Text-to-Speech Service for Tamil (ta-IN) Voices
 * Supports:
 * - Chirp 3 HD Voices (ta-IN-Chirp3-HD-*)
 * - Wavenet Voices (ta-IN-Wavenet-*)
 * - Standard Voices (ta-IN-Standard-*)
 * Uses Google Cloud Text-to-Speech REST API securely on backend.
 */
class GoogleTtsService {
  constructor() {
    this.apiKey = config.GOOGLE_TTS_API_KEY;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Synthesizes text to audio buffer using Google Cloud TTS REST API.
   * @param {Object} options { text, voiceId, speakingRate }
   * @returns {Promise<Buffer>} Audio Buffer (MP3)
   */
  async synthesizeSpeech({ text, voiceId = 'ta-IN-Chirp3-HD-Aoede', speakingRate = 0.88 }) {
    if (!this.isConfigured()) {
      throw new Error('Google Cloud TTS API Key (GOOGLE_TTS_API_KEY) is not configured on the backend server.');
    }

    const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`;
    const selectedVoice = voiceId || 'ta-IN-Chirp3-HD-Aoede';

    const payload = {
      input: { text },
      voice: {
        languageCode: 'ta-IN',
        name: selectedVoice
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: parseFloat(speakingRate || 0.88),
        pitch: 0.0
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Cloud TTS Synthesis failed [HTTP ${response.status}]: ${errText}`);
    }

    const data = await response.json();
    if (!data.audioContent) {
      throw new Error('Google Cloud TTS response did not return audioContent');
    }

    return Buffer.from(data.audioContent, 'base64');
  }
}

module.exports = new GoogleTtsService();
