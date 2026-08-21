const express = require('express');
const router = express.Router();
const ttsService = require('../services/ttsService');

/**
 * @route   GET /api/tts/status
 * @desc    Get connectivity status of backend TTS providers (Azure & Google)
 * @access  Public / Authenticated
 */
router.get('/status', (req, res) => {
  try {
    const status = ttsService.getProviderStatus();
    res.status(200).json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/tts/synthesize
 * @desc    Synthesize Tamil speech audio buffer from Azure or Google Cloud
 * @access  Public / Authenticated
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { provider, voiceId, text, language = 'ta-IN', rate = 0.88, hospitalId = null } = req.body;

    if (!provider || !voiceId || !text) {
      return res.status(400).json({
        success: false,
        message: 'Parameters provider, voiceId, and text are required.'
      });
    }

    const audioBuffer = await ttsService.synthesizeSpeech({
      provider,
      voiceId,
      text,
      language,
      rate,
      hospitalId
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'public, max-age=86400' // Cache audio buffer for 24h
    });

    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error('[TTS API SYNTHESIS ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'TTS synthesis failed on backend server.'
    });
  }
});

module.exports = router;
