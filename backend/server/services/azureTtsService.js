const config = require('../config/config');

/**
 * Azure Speech Text-to-Speech Service for Tamil (ta-IN) Neural Voices
 * Uses Azure Cognitive Services REST API for speech synthesis.
 * Supported Tamil India Neural Voices:
 * - ta-IN-PallaviNeural (Female)
 * - ta-IN-ValluvarNeural (Male)
 */
class AzureTtsService {
  constructor() {
    this.key = config.AZURE_SPEECH_KEY;
    this.region = config.AZURE_SPEECH_REGION || 'eastus';
  }

  isConfigured() {
    return Boolean(this.key && this.key.trim().length > 0);
  }

  /**
   * Synthesizes text to audio buffer using Azure Speech REST API.
   * @param {Object} options { text, voiceId, rate, pitch }
   * @returns {Promise<Buffer>} Audio Buffer (MP3)
   */
  async synthesizeSpeech({ text, voiceId = 'ta-IN-PallaviNeural', rate = '0.88' }) {
    if (!this.isConfigured()) {
      throw new Error('Azure Speech API Key (AZURE_SPEECH_KEY) is not configured on the backend server.');
    }

    const endpoint = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const selectedVoice = voiceId || 'ta-IN-PallaviNeural';
    const ratePercent = `${Math.round((parseFloat(rate || 0.88) - 1.0) * 100)}%`;

    // Construct SSML (Speech Synthesis Markup Language)
    const ssml = `
      <speak version='1.0' xml:lang='ta-IN'>
        <voice xml:lang='ta-IN' xml:gender='Female' name='${selectedVoice}'>
          <prosody rate='${ratePercent}'>
            ${text}
          </prosody>
        </voice>
      </speak>
    `.trim();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'VillZoneHIMS'
      },
      body: ssml
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Azure TTS Synthesis failed [HTTP ${response.status}]: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

module.exports = new AzureTtsService();
