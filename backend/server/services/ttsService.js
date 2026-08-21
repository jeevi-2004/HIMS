const azureTtsService = require('./azureTtsService');
const googleTtsService = require('./googleTtsService');
const sarvamTtsService = require('./sarvamTtsService');

/**
 * Unified TTS Service Resolver
 * Manages provider execution, status checks, and synthesis for Sarvam AI, Azure, and Google Cloud.
 */
class TtsService {
  getProviderStatus() {
    return {
      sarvam: {
        id: 'sarvam',
        name: 'Sarvam AI Tamil Speech',
        status: sarvamTtsService.isConfigured() ? 'Connected' : 'Not Configured',
        voicesCount: sarvamTtsService.getVoiceCatalog().length,
        voices: sarvamTtsService.getVoiceCatalog()
      },
      azure: {
        id: 'azure',
        name: 'Microsoft Azure Speech',
        status: azureTtsService.isConfigured() ? 'Connected' : 'Not Configured',
        voicesCount: 2
      },
      google: {
        id: 'google',
        name: 'Google Cloud Text-to-Speech',
        status: googleTtsService.isConfigured() ? 'Connected' : 'Not Configured',
        voicesCount: 22
      },
      browser: {
        id: 'browser',
        name: 'Local Browser Web Speech API',
        status: 'Available',
        voicesCount: 'Dynamic'
      }
    };
  }

  async synthesizeSpeech({ provider, voiceId, text, language = 'ta-IN', rate = 0.88, hospitalId = null }) {
    if (!text || !text.trim()) {
      throw new Error('Text to synthesize is required.');
    }

    if (provider === 'sarvam') {
      return await sarvamTtsService.synthesizeSpeech({ text, voiceId, pace: rate, hospitalId });
    }

    if (provider === 'azure') {
      return await azureTtsService.synthesizeSpeech({ text, voiceId, rate });
    }

    if (provider === 'google') {
      return await googleTtsService.synthesizeSpeech({ text, voiceId, speakingRate: rate });
    }

    throw new Error(`Unsupported or client-side provider: ${provider}`);
  }
}

module.exports = new TtsService();
