import toast from 'react-hot-toast';

/**
 * VillZone HIMS — Browser Web Speech API Voice Announcement Service (Phase 7.2)
 * Centralized Web Speech API service managing patient call announcements,
 * lastVoiceAnnouncement snapshot state, replay capabilities, and multi-tab synchronization.
 */

// Helper to parse pure numeric token number (e.g. OP-01 -> 1, OP-02 -> 2, 05 -> 5)
const extractNumericToken = (rawToken) => {
  if (!rawToken) return '1';
  const str = String(rawToken).replace(/^#/g, '');
  const matches = str.match(/\d+/);
  if (matches && matches[0]) {
    return String(parseInt(matches[0], 10));
  }
  return str;
};

/**
 * Comprehensive Phonetic Dictionary & Syllabification Engine for Tamil TTS
 * Converts any dynamic patient or doctor name (single word or multi-word full names)
 * into natural, fluent Tamil Unicode script for Web Speech Synthesis (ta-IN).
 */
const TAMIL_NAME_MAP = {
  'tara': 'தாரா',
  'tharun': 'தருண்',
  'tarun': 'தருண்',
  'priya': 'பிரியா',
  'kumar': 'குமார்',
  'arun': 'அருண்',
  'ravi': 'ரவி',
  'ramesh': 'ரமேஷ்',
  'suresh': 'சுரேஷ்',
  'meena': 'மீனா',
  'karthik': 'கார்த்திக்',
  'vijay': 'விஜய்',
  'anand': 'ஆனந்த்',
  'lakshmi': 'லக்ஷ்மி',
  'saravanan': 'சரவணன்',
  'santhosh': 'சந்தோஷ்',
  'gokul': 'கோகுல்',
  'rajeswari': 'ராஜேஸ்வரி',
  'divya': 'திவ்யா',
  'deepak': 'தீபக்',
  'sangeetha': 'சங்கீதா',
  'raja': 'ராஜா',
  'bala': 'பாலா',
  'murali': 'முரளி',
  'ganesh': 'கணேஷ்',
  'selvam': 'செல்வம்',
  'dinesh': 'தினேஷ்',
  'vignesh': 'விக்னேஷ்',
  'soundarya': 'சௌந்தர்யா',
  'revathi': 'ரேவதி',
  'radha': 'ராதா',
  'saroja': 'சரோஜா',
  'kamal': 'கமால்',
  'surya': 'சூர்யா',
  'tata': 'தாதா',
  'tatha': 'தாத்தா',
  'tatha.': 'தாத்தா',
  'mohan': 'மோகன்',
  'krishnan': 'கிருஷ்ணன்',
  'venkat': 'வெங்கட்',
  'prakash': 'பிரகாஷ்',
  'ashok': 'அசோக்',
  'shankar': 'சங்கர்',
  'siva': 'சிவா',
  'shiva': 'சிவா',
  'prabhu': 'பிரபு',
  'seetha': 'சீதா',
  'sita': 'சீதா',
  'geetha': 'கீதா',
  'uma': 'உமா',
  'uma.': 'உமா',
  'devi': 'தேவி',
  'kala': 'கலா',
  'viji': 'விஜி',
  'janaki': 'ஜானகி',
  'vaithi': 'வைத்தி',
  'natarajan': 'நடராஜன்',
  'murugan': 'முருகன்',
  'velan': 'வேலன்',
  'kannan': 'கண்ணன்',
  'nathan': 'நாதன்'
};

/**
 * Advanced English-to-Tamil Syllables Transliteration Algorithm
 * Handles unmapped names dynamically by parsing consonants, vowels, and combinations.
 */
const transliterateWordToTamil = (word) => {
  if (!word) return '';
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return word;

  if (TAMIL_NAME_MAP[clean]) {
    return TAMIL_NAME_MAP[clean];
  }

  let s = clean;
  // Multi-character consonant clusters
  s = s.replace(/karth/g, 'கார்த்தி')
       .replace(/shw/g, 'ஷ்வ')
       .replace(/ksh/g, 'க்ஷ்')
       .replace(/nth/g, 'ந்த்')
       .replace(/ndh/g, 'ந்த்')
       .replace(/ng/g, 'ங்')
       .replace(/nj/g, 'ஞ்')
       .replace(/tha/g, 'தா')
       .replace(/thi/g, 'தி')
       .replace(/thu/g, 'து')
       .replace(/the/g, 'தெ')
       .replace(/tho/g, 'தொ')
       .replace(/dha/g, 'தா')
       .replace(/dhi/g, 'தி')
       .replace(/dhu/g, 'து')
       .replace(/dhe/g, 'தெ')
       .replace(/dho/g, 'தொ')
       .replace(/sha/g, 'ஷா')
       .replace(/shi/g, 'ஷி')
       .replace(/shu/g, 'ஷு')
       .replace(/she/g, 'ஷெ')
       .replace(/sho/g, 'ஷொ')
       .replace(/cha/g, 'சா')
       .replace(/chi/g, 'சி')
       .replace(/chu/g, 'சு')
       .replace(/che/g, 'செ')
       .replace(/cho/g, 'சொ')
       .replace(/th/g, 'த்')
       .replace(/dh/g, 'த்')
       .replace(/sh/g, 'ஷ்')
       .replace(/ch/g, 'ச்')
       .replace(/ph/g, 'ப்')
       .replace(/bh/g, 'ப்')
       .replace(/gh/g, 'க்')
       .replace(/kh/g, 'க்')
       .replace(/zh/g, 'ழ்');

  // Long vowels (aa, ee, oo, ii, uu, ai, au)
  s = s.replace(/aa/g, 'ஆ')
       .replace(/ee/g, 'ஈ')
       .replace(/ii/g, 'ஈ')
       .replace(/oo/g, 'ஊ')
       .replace(/uu/g, 'ஊ')
       .replace(/ai/g, 'ஐ')
       .replace(/au/g, 'ஔ')
       .replace(/ou/g, 'ஔ');

  // Comprehensive Consonant + Short/Long Vowel Syllables (Phase B)
  s = s.replace(/kaa/g, 'கா').replace(/ka/g, 'கா').replace(/ki/g, 'கி').replace(/kii/g, 'கீ').replace(/ku/g, 'கு').replace(/kuu/g, 'கூ').replace(/ke/g, 'கெ').replace(/ko/g, 'கோ')
       .replace(/caa/g, 'சா').replace(/ca/g, 'சா').replace(/ci/g, 'சி').replace(/cii/g, 'சீ').replace(/cu/g, 'சு').replace(/cuu/g, 'சூ').replace(/ce/g, 'செ').replace(/co/g, 'சோ')
       .replace(/taa/g, 'தா').replace(/ta/g, 'தா').replace(/ti/g, 'தி').replace(/tii/g, 'தீ').replace(/tu/g, 'து').replace(/tuu/g, 'தூ').replace(/te/g, 'தெ').replace(/to/g, 'தோ')
       .replace(/paa/g, 'பா').replace(/pa/g, 'பா').replace(/pi/g, 'பி').replace(/pii/g, 'பீ').replace(/pu/g, 'பு').replace(/puu/g, 'பூ').replace(/pe/g, 'பெ').replace(/po/g, 'போ')
       .replace(/baa/g, 'பா').replace(/ba/g, 'பா').replace(/bi/g, 'பி').replace(/bii/g, 'பீ').replace(/bu/g, 'பு').replace(/buu/g, 'பூ').replace(/be/g, 'பெ').replace(/bo/g, 'போ')
       .replace(/maa/g, 'மா').replace(/ma/g, 'மா').replace(/mi/g, 'மி').replace(/mii/g, 'மீ').replace(/mu/g, 'மு').replace(/muu/g, 'மூ').replace(/me/g, 'மெ').replace(/mo/g, 'மோ')
       .replace(/naa/g, 'நா').replace(/na/g, 'நா').replace(/ni/g, 'நி').replace(/nii/g, 'நீ').replace(/nu/g, 'நு').replace(/nuu/g, 'நூ').replace(/ne/g, 'நெ').replace(/no/g, 'நோ')
       .replace(/raa/g, 'ரா').replace(/ra/g, 'ரா').replace(/ri/g, 'ரி').replace(/rii/g, 'ரீ').replace(/ru/g, 'ரு').replace(/ruu/g, 'ரூ').replace(/re/g, 'ரெ').replace(/ro/g, 'ரோ')
       .replace(/laa/g, 'லா').replace(/la/g, 'லா').replace(/li/g, 'லி').replace(/lii/g, 'லீ').replace(/lu/g, 'லு').replace(/luu/g, 'லூ').replace(/le/g, 'லெ').replace(/lo/g, 'லோ')
       .replace(/vaa/g, 'வா').replace(/va/g, 'வா').replace(/vi/g, 'வி').replace(/vii/g, 'வீ').replace(/vu/g, 'வு').replace(/vuu/g, 'வூ').replace(/ve/g, 'வெ').replace(/vo/g, 'வோ')
       .replace(/yaa/g, 'யா').replace(/ya/g, 'யா').replace(/yi/g, 'யி').replace(/yii/g, 'யீ').replace(/yu/g, 'யு').replace(/yuu/g, 'யூ').replace(/ye/g, 'யெ').replace(/yo/g, 'யோ')
       .replace(/saa/g, 'சா').replace(/sa/g, 'சா').replace(/si/g, 'சி').replace(/sii/g, 'சீ').replace(/su/g, 'சு').replace(/suu/g, 'சூ').replace(/se/g, 'செ').replace(/so/g, 'சோ')
       .replace(/jaa/g, 'ஜா').replace(/ja/g, 'ஜா').replace(/ji/g, 'ஜி').replace(/jii/g, 'ஜீ').replace(/ju/g, 'ஜு').replace(/juu/g, 'ஜூ').replace(/je/g, 'ஜெ').replace(/jo/g, 'ஜோ')
       .replace(/haa/g, 'ஹா').replace(/ha/g, 'ஹா').replace(/hi/g, 'ஹி').replace(/hii/g, 'ஹீ').replace(/hu/g, 'ஹு').replace(/huu/g, 'ஹூ').replace(/he/g, 'ஹெ').replace(/ho/g, 'ஹோ');

  // Single Vowels & Ending Consonants
  s = s.replace(/a/g, 'அ').replace(/e/g, 'எ').replace(/i/g, 'இ').replace(/o/g, 'ஒ').replace(/u/g, 'உ')
       .replace(/k/g, 'க்').replace(/c/g, 'ச்').replace(/t/g, 'த்').replace(/p/g, 'ப்').replace(/b/g, 'ப்')
       .replace(/m/g, 'ம்').replace(/n/g, 'ன்').replace(/r/g, 'ர்').replace(/l/g, 'ல்').replace(/v/g, 'வ்')
       .replace(/y/g, 'ய்').replace(/s/g, 'ஸ்').replace(/j/g, 'ஜ்').replace(/h/g, 'ஹ்');

  return s;
};

const transliterateToTamil = (text) => {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';

  // If text is already in Tamil script (contains Tamil Unicode range \u0B80-\u0BFF), return as is
  if (/[\u0B80-\u0BFF]/.test(trimmed)) {
    return trimmed;
  }

  // Process multi-word full names (e.g. "Tata Ramesh" or "Kumar S")
  const words = trimmed.split(/\s+/);
  const transliteratedWords = words.map(w => transliterateWordToTamil(w));

  return transliteratedWords.join(' ');
};

class VoiceAnnouncementService {
  constructor() {
    this.lastVoiceAnnouncement = null;
    this.lastAnnouncedToken = null;
    this.lastAnnouncedTimestamp = 0;
    
    // Internal FIFO Queue and Execution State
    this.queue = [];
    this.isSpeaking = false;

    // Default Voice Settings & Saved Preferences
    this.settings = {
      language: 'en-US',
      languageMode: 'BOTH', // 'EN_ONLY' | 'TA_ONLY' | 'BOTH'
      voiceName: 'Default',
      speed: 1.0,
      volume: 1.0,
      pitch: 1.0,
      profile: 'Professional', // 'Professional' | 'Gentle' | 'Clear OPD'
      provider: 'browser', // 'browser' | 'sarvam' | 'azure' | 'google'
      voiceId: null, // Voice identifier for cloud/browser
      fallbackProvider: 'browser',
      customEnglishVoiceName: null,
      customEnglishVoiceLang: null,
      customTamilVoiceName: null,
      customTamilVoiceLang: null,
      sarvamVoiceId: 'kavitha',
      azureVoiceId: 'ta-IN-PallaviNeural',
      googleVoiceId: 'ta-IN-Chirp3-HD-Aoede'
    };

    // Load saved preferences from localStorage
    this.loadSavedPreferences();

    // Multi-tab broadcast channel for reception voice announcements and sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('villzone_hims_voice_channel');
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'ANNOUNCEMENT_PLAYED') {
            this.lastAnnouncedToken = event.data.token;
            this.lastAnnouncedTimestamp = event.data.timestamp;
            if (event.data.announcement) {
              this.lastVoiceAnnouncement = event.data.announcement;
            }
          } else if (event.data?.type === 'RECEPTION_VOICE_CALL') {
            this.lastAnnouncedToken = event.data.token;
            this.lastAnnouncedTimestamp = event.data.timestamp;
            if (event.data.announcement) {
              this.lastVoiceAnnouncement = event.data.announcement;
            }

            // Synthesize audio ONLY if running outside Doctor Desk screens (e.g. Reception, Display Board)
            const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
            const isDoctorPage = pathname.includes('/doctor');
            if (!isDoctorPage && event.data.announcementData) {
              this.enqueueAnnouncement({
                ...event.data.announcementData,
                broadcastOnly: false
              });
            }
          }
        };
      } catch (err) {
        console.warn('[VOICE ANNOUNCEMENT] BroadcastChannel not supported:', err);
      }
    }
    // Pre-trigger voice loading for Chrome / Edge
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
        };
      } catch (e) {}
    }
  }

  loadSavedPreferences() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('hims_voice_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.settings = { ...this.settings, ...parsed };
      }
    } catch (e) {
      console.warn('[VOICE ANNOUNCEMENT] Failed to load saved voice settings:', e);
    }
  }

  saveVoiceSettings(newSettings = {}) {
    this.settings = { ...this.settings, ...newSettings };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('hims_voice_settings', JSON.stringify({
          provider: this.settings.provider,
          sarvamVoiceId: this.settings.sarvamVoiceId,
          azureVoiceId: this.settings.azureVoiceId,
          googleVoiceId: this.settings.googleVoiceId,
          customEnglishVoiceName: this.settings.customEnglishVoiceName,
          customEnglishVoiceLang: this.settings.customEnglishVoiceLang,
          customTamilVoiceName: this.settings.customTamilVoiceName,
          customTamilVoiceLang: this.settings.customTamilVoiceLang,
          languageMode: this.settings.languageMode,
          profile: this.settings.profile
        }));
      } catch (e) {
        console.error('[VOICE ANNOUNCEMENT] Failed to save voice settings:', e);
      }
    }
  }

  resetToAutomatic() {
    this.settings.provider = 'browser';
    this.settings.customEnglishVoiceName = null;
    this.settings.customEnglishVoiceLang = null;
    this.settings.customTamilVoiceName = null;
    this.settings.customTamilVoiceLang = null;
    this.settings.sarvamVoiceId = 'ananya';
    this.settings.azureVoiceId = 'ta-IN-PallaviNeural';
    this.settings.googleVoiceId = 'ta-IN-Chirp3-HD-Aoede';
    this.settings.profile = 'Professional';
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('hims_voice_settings');
      } catch (e) {}
    }
  }

  updateSettings(newSettings = {}) {
    this.settings = { ...this.settings, ...newSettings };
  }

  setLanguage(lang) {
    this.settings.language = lang;
  }

  setVoice(voiceName) {
    this.settings.voiceName = voiceName;
  }

  setRate(speed) {
    this.settings.speed = speed;
  }

  setVolume(volume) {
    this.settings.volume = volume;
  }

  /**
   * Stop current speech, clear pending queue items, and reset speaking state.
   */
  stopAnnouncement() {
    this.stopAnnouncements();
  }

  stopAnnouncements() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.queue = [];
    this.isSpeaking = false;
  }

  /**
   * Seeds the lastVoiceAnnouncement snapshot from an existing active patient without speaking.
   */
  setLastAnnouncementFromPatient(patient) {
    if (!patient) return;
    const token = patient.tokenNumber || patient.token || 'N/A';
    const rawPatientName = patient.patientId?.name || patient.patientName || '';
    const rawDoctorName = patient.doctorId?.name || patient.doctorName || '';
    const roomNo = patient.doctorId?.doctorProfile?.roomNumber || 'Room 1';

    this.lastVoiceAnnouncement = {
      token,
      patientName: rawPatientName,
      doctorName: rawDoctorName,
      room: roomNo,
      language: this.settings.language || 'en-US',
      languageMode: this.settings.languageMode || 'BOTH',
      voiceName: this.settings.voiceName || 'Default',
      speed: this.settings.speed || 1.0,
      volume: this.settings.volume !== undefined ? this.settings.volume : 1.0,
      pitch: this.settings.pitch || 1.0,
      spokenText: '',
      timestamp: Date.now()
    };
  }

  /**
   * Checks if browser/OS has a native Tamil voice installed.
   */
  hasTamilVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
    const voices = window.speechSynthesis.getVoices();
    return voices.some(v => {
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      const vName = (v.name || '').toLowerCase();
      return vLang.startsWith('ta') || vName.includes('tamil') || vName.includes('தமிழ்');
    });
  }

  /**
   * Constructs the English announcement phrase.
   * Format: Token [TOKEN_NUMBER], [PATIENT_NAME], please proceed to Doctor [DOCTOR_NAME] Consultation Room.
   * Graceful fallback if patientName or doctorName is missing.
   */
  buildEnglishPhrase(patient) {
    if (!patient) return null;
    let rawToken = patient.tokenNumber || patient.token || patient.tokenNo || patient.tokenNumber === 0 ? (patient.tokenNumber || patient.token || patient.tokenNo) : '1';
    let numericToken = extractNumericToken(rawToken);

    const pName = patient.patientName || (typeof patient.patientId === 'object' && patient.patientId?.name ? patient.patientId.name : (patient.name || ''));
    const dName = patient.doctorName || (typeof patient.doctorId === 'object' && patient.doctorId?.name ? patient.doctorId.name : (patient.doctor || ''));
    const docClean = dName ? String(dName).replace(/^Dr\.\s*/i, '').trim() : '';

    const patientPart = pName && pName.trim() ? `${pName.trim()}, ` : '';
    const doctorPart = docClean ? `Doctor ${docClean} ` : 'Doctor ';

    return `Token ${numericToken}, ${patientPart}please proceed to ${doctorPart}Consultation Room.`;
  }

  /**
   * Constructs the Tamil announcement phrase.
   * Format: டோக்கன் எண் [TOKEN_NUMBER], [PATIENT_NAME], டாக்டர் [DOCTOR_NAME] ஆலோசனை அறைக்கு செல்லவும்.
   * Repeat call format: டோக்கன் எண் [TOKEN_NUMBER], [PATIENT_NAME]. இது இரண்டாவது அழைப்பு. தயவுசெய்து டாக்டர் [DOCTOR_NAME] ஆலோசனை அறைக்கு செல்லவும்.
   * Natural Tamil Nadu hospital receptionist tone.
   */
  buildTamilPhrase(patient, isRepeat = false) {
    if (!patient) return null;
    let rawToken = patient.tokenNumber || patient.token || patient.tokenNo || patient.tokenNumber === 0 ? (patient.tokenNumber || patient.token || patient.tokenNo) : '1';
    let numericToken = extractNumericToken(rawToken);

    const pName = patient.patientName || (typeof patient.patientId === 'object' && patient.patientId?.name ? patient.patientId.name : (patient.name || ''));
    const dName = patient.doctorName || (typeof patient.doctorId === 'object' && patient.doctorId?.name ? patient.doctorId.name : (patient.doctor || ''));
    const docClean = dName ? String(dName).replace(/^Dr\.\s*/i, '').trim() : '';

    // Transliterate English names into Tamil script for natural native pronunciation
    const tamilPatientName = pName ? transliterateToTamil(pName) : '';
    const tamilDoctorName = docClean ? transliterateToTamil(docClean) : '';

    const patientPart = tamilPatientName && tamilPatientName.trim() ? `${tamilPatientName.trim()}, ` : '';
    const doctorPart = tamilDoctorName && tamilDoctorName.trim() ? `டாக்டர் ${tamilDoctorName.trim()} ` : 'டாக்டர் ';

    if (isRepeat) {
      const patientRepeat = tamilPatientName && tamilPatientName.trim() ? `${tamilPatientName.trim()}. ` : '';
      return `டோக்கன் எண் ${numericToken}, ${patientRepeat}இது இரண்டாவது அழைப்பு. தயவுசெய்து ${doctorPart}ஆலோசனை அறைக்கு செல்லவும்.`;
    }

    return `டோக்கன் எண் ${numericToken}, ${patientPart}${doctorPart}ஆலோசனை அறைக்கு செல்லவும்.`;
  }

  /**
   * Constructs the announcement phrase in English, Tamil, or Both based on settings.
   */
  buildAnnouncementPhrase(patient, forceLang = null) {
    if (!patient) return null;
    const mode = forceLang || this.settings.languageMode || 'BOTH';

    if (mode === 'TA_ONLY') {
      return this.buildTamilPhrase(patient);
    } else if (mode === 'EN_ONLY') {
      return this.buildEnglishPhrase(patient);
    }

    // Default BOTH: Returns combined text for history/logs
    return `${this.buildEnglishPhrase(patient)} ${this.buildTamilPhrase(patient)}`;
  }

  /**
   * Triggers the Web Speech API audio utterance via FIFO queue.
   */
  announceCall(patient) {
    return this.announcePatient(patient);
  }

  announcePatient(patient) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.log('[VOICE ANNOUNCEMENT] Web Speech API not supported in this browser.');
      return false;
    }

    const token = patient.tokenNumber || patient.token || '';
    const rawPatientName = patient.patientName || (typeof patient.patientId === 'object' && patient.patientId?.name ? patient.patientId.name : (patient.name || ''));
    const rawDoctorName = patient.doctorName || (typeof patient.doctorId === 'object' && patient.doctorId?.name ? patient.doctorId.name : (patient.doctor || ''));
    const mode = patient.mode || this.settings.languageMode || 'BOTH';
    const isRepeat = !!patient.isRepeat;

    return this.enqueueAnnouncement({
      tokenNumber: token,
      patientName: rawPatientName,
      doctorName: rawDoctorName,
      mode: mode,
      isRepeat: isRepeat,
      patientObj: patient,
      timestamp: Date.now()
    });
  }

  /**
   * Public Queue Entry API
   */
  enqueueAnnouncement(announcementData) {
    if (!announcementData) return false;

    const tokenNumber = announcementData.tokenNumber || announcementData.token || '';
    const patientName = announcementData.patientName || '';
    const doctorName = announcementData.doctorName || '';
    const mode = announcementData.mode || this.settings.languageMode || 'BOTH';
    const isRepeat = !!announcementData.isRepeat;
    const now = Date.now();

    // Lightweight Duplicate Protection: Prevent rapid duplicate events (< 4.5 seconds)
    const dupKey = `${tokenNumber}_${patientName}_${doctorName}_${isRepeat ? 'repeat' : 'first'}`;
    if (this.lastAnnouncedKey === dupKey && (now - this.lastAnnouncedTimestamp) < 4500) {
      console.log(`[VOICE ANNOUNCEMENT] Rapid duplicate announcement for Token #${tokenNumber} suppressed.`);
      return false;
    }

    this.lastAnnouncedKey = dupKey;
    this.lastAnnouncedToken = tokenNumber;
    this.lastAnnouncedTimestamp = now;

    // Build Item Structure
    const queueItem = {
      tokenNumber,
      patientName,
      doctorName,
      mode,
      isRepeat,
      engText: this.buildEnglishPhrase(announcementData.patientObj || announcementData),
      tamText: this.buildTamilPhrase(announcementData.patientObj || announcementData, isRepeat),
      timestamp: now
    };

    // Store snapshot for replay capabilities
    this.lastVoiceAnnouncement = {
      token: tokenNumber,
      patientName,
      doctorName,
      engText: queueItem.engText,
      tamText: queueItem.tamText,
      languageMode: mode,
      timestamp: now
    };

    // Multi-tab Broadcast Notification
    if (this.channel) {
      this.channel.postMessage({
        type: 'ANNOUNCEMENT_PLAYED',
        token: tokenNumber,
        timestamp: now,
        announcement: this.lastVoiceAnnouncement
      });
    }

    this.queue.push(queueItem);

    if (!this.isSpeaking) {
      this.processNextAnnouncement();
    }
    return true;
  }

  /**
   * Replays the most recent consultation announcement stored in lastVoiceAnnouncement.
   */
  repeatLastAnnouncement() {
    if (!this.lastVoiceAnnouncement) {
      toast.error('No announcement available to replay.');
      return false;
    }

    const ann = { ...this.lastVoiceAnnouncement };
    return this.enqueueAnnouncement({
      tokenNumber: ann.token,
      patientName: ann.patientName,
      doctorName: ann.doctorName,
      mode: this.settings.languageMode || ann.languageMode || 'BOTH',
      isRepeat: true
    });
  }

  /**
   * Resolves Voice Parameters based on selected profile
   * Profile options: Professional (default), Gentle, Clear OPD
   */
  getProfileParameters() {
    const prof = this.settings.profile || 'Professional';
    if (prof === 'Gentle') {
      return { engRate: 0.84, engPitch: 1.02, tamRate: 0.84, tamPitch: 1.02, volume: 1.0 };
    }
    if (prof === 'Clear OPD') {
      return { engRate: 0.90, engPitch: 1.0, tamRate: 0.90, tamPitch: 1.0, volume: 1.0 };
    }
    // Default Professional
    return { engRate: 0.88, engPitch: 1.0, tamRate: 0.88, tamPitch: 1.0, volume: 1.0 };
  }

  /**
   * Helper to safely resolve a saved voice preference from current browser voices.
   * If saved voice name is not available on current computer, falls back to automatic lookup.
   */
  resolveSavedVoice(savedName, savedLang, defaultLookupFn) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    if (savedName) {
      const exactMatch = voices.find(v => v.name === savedName);
      if (exactMatch) return exactMatch;

      const nameSubMatch = voices.find(v => (v.name || '').toLowerCase().includes(savedName.toLowerCase()));
      if (nameSubMatch) return nameSubMatch;
    }

    if (savedLang) {
      const langMatch = voices.find(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(savedLang.toLowerCase().replace('_', '-')));
      if (langMatch) return langMatch;
    }

    return defaultLookupFn ? defaultLookupFn.call(this) : null;
  }

  /**
   * Finds the best female English voice available on the host OS/Browser
   */
  getBestEnglishVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Check saved preference first
    if (this.settings.customEnglishVoiceName) {
      const resolved = this.resolveSavedVoice(
        this.settings.customEnglishVoiceName,
        this.settings.customEnglishVoiceLang,
        null
      );
      if (resolved) return resolved;
    }

    // 1. Microsoft English India female voice / en-IN female
    const msEnInFemale = voices.find(v => {
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      const vName = (v.name || '').toLowerCase();
      return vLang.startsWith('en-in') && (vName.includes('female') || vName.includes('heera') || vName.includes('neerja') || vName.includes('kalpana') || vName.includes('ananya'));
    });
    if (msEnInFemale) return msEnInFemale;

    // 2. Any available en-IN female voice
    const anyEnInFemale = voices.find(v => {
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      const vName = (v.name || '').toLowerCase();
      return vLang.startsWith('en-in') && vName.includes('female');
    });
    if (anyEnInFemale) return anyEnInFemale;

    // 3. Microsoft Jenny Online (Natural)
    const msJenny = voices.find(v => (v.name || '').toLowerCase().includes('microsoft jenny online (natural)'));
    if (msJenny) return msJenny;

    // 4. Microsoft Zira Desktop
    const msZiraDesktop = voices.find(v => (v.name || '').toLowerCase().includes('microsoft zira desktop'));
    if (msZiraDesktop) return msZiraDesktop;

    // 5. Microsoft Zira
    const msZira = voices.find(v => (v.name || '').toLowerCase().includes('microsoft zira'));
    if (msZira) return msZira;

    // 6. Google English female voice
    const googleEnFemale = voices.find(v => {
      const vName = (v.name || '').toLowerCase();
      return vName.includes('google') && (vName.includes('us english') || vName.includes('uk english female') || vName.includes('female'));
    });
    if (googleEnFemale) return googleEnFemale;

    // 7. Any available en-IN voice
    const anyEnIn = voices.find(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith('en-in'));
    if (anyEnIn) return anyEnIn;

    // 8. Any available English female voice
    const anyEnFemale = voices.find(v => {
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      const vName = (v.name || '').toLowerCase();
      return vLang.startsWith('en') && (vName.includes('female') || vName.includes('zira') || vName.includes('jenny') || vName.includes('samantha') || vName.includes('victoria'));
    });
    if (anyEnFemale) return anyEnFemale;

    // 9. Generic English system voice fallback
    return voices.find(v => (v.lang || '').toLowerCase().startsWith('en')) || null;
  }

  /**
   * Dynamically detects, filters, and prioritizes all Tamil voices available on current device/browser.
   * Filter condition:
   * - voice.lang.toLowerCase().startsWith('ta-')
   * - OR voice.name contains 'Tamil' or 'தமிழ்' (case-insensitive)
   * Priority order:
   * 1. ta-IN + female/natural metadata
   * 2. Exact ta-IN
   * 3. Other ta-* Tamil voices
   * 4. Voice names containing 'Tamil' or 'தமிழ்'
   */
  getAllTamilVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    const voices = window.speechSynthesis.getVoices() || [];

    const tamilVoices = voices.filter(v => {
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      const vName = (v.name || '').toLowerCase();
      return vLang.startsWith('ta-') || vName.includes('tamil') || vName.includes('தமிழ்');
    });

    // Sort according to specified priority criteria
    return tamilVoices.sort((a, b) => {
      const aLang = (a.lang || '').toLowerCase().replace('_', '-');
      const bLang = (b.lang || '').toLowerCase().replace('_', '-');
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();

      const aIsTaInFemale = aLang === 'ta-in' && (aName.includes('female') || aName.includes('penn') || aName.includes('natural'));
      const bIsTaInFemale = bLang === 'ta-in' && (bName.includes('female') || bName.includes('penn') || bName.includes('natural'));

      if (aIsTaInFemale && !bIsTaInFemale) return -1;
      if (!aIsTaInFemale && bIsTaInFemale) return 1;

      const aIsExactTaIn = aLang === 'ta-in';
      const bIsExactTaIn = bLang === 'ta-in';

      if (aIsExactTaIn && !bIsExactTaIn) return -1;
      if (!aIsExactTaIn && bIsExactTaIn) return 1;

      const aIsTa = aLang.startsWith('ta');
      const bIsTa = bLang.startsWith('ta');

      if (aIsTa && !bIsTa) return -1;
      if (!aIsTa && bIsTa) return 1;

      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Finds the best automatic Tamil voice fallback without using saved custom setting
   */
  getAutoBestTamilVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // 1. ta-IN female voice (e.g. Valluvar Female, Google Tamil Female, Microsoft Tamil Female)
    const taInFemale = voices.find(v => {
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      const vName = (v.name || '').toLowerCase();
      return vLang === 'ta-in' && (vName.includes('female') || vName.includes('penn') || vName.includes('vanitha') || vName.includes('kalpana'));
    });
    if (taInFemale) return taInFemale;

    // 2. ta-IN local/native voice
    const taInNative = voices.find(v => {
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      const vName = (v.name || '').toLowerCase();
      return vLang === 'ta-in' && (vName.includes('native') || vName.includes('local') || vName.includes('valluvar') || vName.includes('natural'));
    });
    if (taInNative) return taInNative;

    // 3. Any ta-IN voice
    const anyTaIn = voices.find(v => (v.lang || '').toLowerCase().replace('_', '-') === 'ta-in');
    if (anyTaIn) return anyTaIn;

    // 4. Any ta-* Tamil voice
    const anyTamil = voices.find(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith('ta'));
    if (anyTamil) return anyTamil;

    // 5. Voice name contains Tamil or தமிழ்
    const nameMatch = voices.find(v => {
      const vName = (v.name || '').toLowerCase();
      return vName.includes('tamil') || vName.includes('தமிழ்');
    });
    if (nameMatch) return nameMatch;

    // 6. System Tamil fallback
    return null;
  }

  /**
   * Finds the best Tamil voice available on the host OS/Browser
   */
  getBestTamilVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

    // Check saved preference first
    if (this.settings.customTamilVoiceName) {
      const resolved = this.resolveSavedVoice(
        this.settings.customTamilVoiceName,
        this.settings.customTamilVoiceLang,
        null
      );
      if (resolved) return resolved;
    }

    return this.getAutoBestTamilVoice();
  }

  /**
   * Diagnostic helper: Returns all browser voices and active selections
   */
  getAvailableVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices() || [];
  }

  getVoiceDiagnostics() {
    const englishVoice = this.getBestEnglishVoice();
    const tamilVoice = this.getBestTamilVoice();
    const isSavedEngAvailable = this.settings.customEnglishVoiceName
      ? !!this.getAvailableVoices().find(v => v.name === this.settings.customEnglishVoiceName)
      : true;
    const isSavedTamAvailable = this.settings.customTamilVoiceName
      ? !!this.getAvailableVoices().find(v => v.name === this.settings.customTamilVoiceName)
      : true;

    return {
      activeEnglish: englishVoice ? { name: englishVoice.name, lang: englishVoice.lang, localService: englishVoice.localService } : null,
      activeTamil: tamilVoice ? { name: tamilVoice.name, lang: tamilVoice.lang, localService: tamilVoice.localService } : null,
      savedEnglishName: this.settings.customEnglishVoiceName,
      savedTamilName: this.settings.customTamilVoiceName,
      isSavedEngAvailable,
      isSavedTamAvailable,
      profile: this.settings.profile || 'Professional',
      mode: this.settings.languageMode || 'BOTH'
    };
  }

  /**
   * Synthesizes & plays audio from Backend Cloud TTS Endpoint (Azure / Google Cloud).
   * @returns {Promise<boolean>} Success status
   */
  async playCloudAudio(text, provider, voiceId) {
    try {
      const response = await fetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          voiceId,
          text,
          language: 'ta-IN',
          rate: 0.88
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Cloud TTS HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);

      return new Promise((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve(true);
        };
        audio.onerror = (err) => {
          console.warn(`[VOICE ANNOUNCEMENT] ${provider} Cloud Audio playback error:`, err);
          URL.revokeObjectURL(audioUrl);
          resolve(false);
        };
        audio.play().catch((err) => {
          console.warn(`[VOICE ANNOUNCEMENT] Audio play rejected:`, err);
          URL.revokeObjectURL(audioUrl);
          resolve(false);
        });
      });
    } catch (err) {
      console.warn(`[VOICE ANNOUNCEMENT] Cloud TTS synthesis failed [${provider}]:`, err.message);
      return false;
    }
  }

  /**
   * Admin Voice Preview Methods
   */
  async testSingleVoice(text, voiceObject, lang = 'en-IN', provider = 'browser', customVoiceId = null) {
    if (provider === 'sarvam' || provider === 'azure' || provider === 'google') {
      const vId = customVoiceId || (provider === 'sarvam' ? this.settings.sarvamVoiceId : provider === 'azure' ? this.settings.azureVoiceId : this.settings.googleVoiceId);
      const ok = await this.playCloudAudio(text, provider, vId);
      if (!ok) {
        toast.error(`Cloud TTS (${provider}) synthesis failed. Check backend credentials or connection.`);
      }
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const params = this.getProfileParameters();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = lang.startsWith('ta') ? params.tamRate : params.engRate;
      u.pitch = lang.startsWith('ta') ? params.tamPitch : params.engPitch;
      u.volume = params.volume;
      if (voiceObject) u.voice = voiceObject;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.error('[VOICE ANNOUNCEMENT] Test single voice error:', e);
    }
  }

  async testFullAnnouncement(customEngVoice = null, customTamVoice = null) {
    const provider = this.settings.provider || 'browser';
    const samplePatient = { tokenNumber: '25', patientName: 'Priya', doctorName: 'Arun' };
    const engText = this.buildEnglishPhrase(samplePatient);
    const tamText = this.buildTamilPhrase(samplePatient);
    const params = this.getProfileParameters();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // 1. Speak English Female Voice
    const engVoice = customEngVoice || this.getBestEnglishVoice();
    const uEng = new SpeechSynthesisUtterance(engText);
    uEng.lang = 'en-IN';
    uEng.rate = params.engRate;
    uEng.pitch = params.engPitch;
    uEng.volume = params.volume;
    if (engVoice) uEng.voice = engVoice;

    let isEngFinished = false;
    const onEngFinish = async () => {
      if (isEngFinished) return;
      isEngFinished = true;

      // 400ms pause as specified
      await new Promise(r => setTimeout(r, 400));

      if (provider === 'sarvam' || provider === 'azure' || provider === 'google') {
        const vId = provider === 'sarvam' ? (this.settings.sarvamVoiceId || 'kavitha') : provider === 'azure' ? (this.settings.azureVoiceId || 'ta-IN-PallaviNeural') : (this.settings.googleVoiceId || 'ta-IN-Chirp3-HD-Aoede');
        const ok = await this.playCloudAudio(tamText, provider, vId);
        if (!ok) {
          // Fall back to local Tamil Browser TTS
          console.warn('[VOICE PREVIEW] Cloud synthesis failed, playing local Tamil fallback.');
          const tamVoice = customTamVoice || this.getBestTamilVoice();
          const uTam = new SpeechSynthesisUtterance(tamText);
          uTam.lang = 'ta-IN';
          uTam.rate = params.tamRate;
          uTam.pitch = params.tamPitch;
          if (tamVoice) uTam.voice = tamVoice;
          window.speechSynthesis.speak(uTam);
        }
      } else {
        const tamVoice = customTamVoice || this.getBestTamilVoice();
        const uTam = new SpeechSynthesisUtterance(tamText);
        uTam.lang = 'ta-IN';
        uTam.rate = params.tamRate;
        uTam.pitch = params.tamPitch;
        if (tamVoice) uTam.voice = tamVoice;
        window.speechSynthesis.speak(uTam);
      }
    };

    uEng.onend = onEngFinish;
    uEng.onerror = onEngFinish;

    window.speechSynthesis.speak(uEng);
  }

  enqueueAnnouncement(announcementData) {
    if (!announcementData) return false;

    const { tokenNumber, patientName, doctorName, mode = 'BOTH', isRepeat = false, broadcastOnly = false } = announcementData;
    const now = Date.now();

    // Deduplication Protection: Prevent rapid duplicate events (< 8.0 seconds) for the same token number
    const normToken = String(tokenNumber || announcementData.token || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (normToken && this.lastAnnouncedToken === normToken && !isRepeat && (now - this.lastAnnouncedTimestamp) < 8000) {
      console.log(`[VOICE ANNOUNCEMENT] Rapid duplicate announcement for Token #${tokenNumber} suppressed.`);
      return false;
    }

    this.lastAnnouncedToken = normToken;
    this.lastAnnouncedTimestamp = now;

    // Build Item Structure
    const queueItem = {
      tokenNumber,
      patientName,
      doctorName,
      mode,
      isRepeat,
      engText: this.buildEnglishPhrase(announcementData.patientObj || announcementData),
      tamText: this.buildTamilPhrase(announcementData.patientObj || announcementData, isRepeat),
      timestamp: now
    };

    // Store snapshot for replay capabilities
    this.lastVoiceAnnouncement = {
      token: tokenNumber,
      patientName,
      doctorName,
      engText: queueItem.engText,
      tamText: queueItem.tamText,
      languageMode: mode,
      timestamp: now
    };

    // Multi-tab Broadcast Notification
    if (this.channel) {
      this.channel.postMessage({
        type: broadcastOnly ? 'RECEPTION_VOICE_CALL' : 'ANNOUNCEMENT_PLAYED',
        token: tokenNumber,
        timestamp: now,
        announcement: this.lastVoiceAnnouncement,
        announcementData: {
          tokenNumber,
          patientName,
          doctorName,
          mode,
          isRepeat,
          patientObj: announcementData.patientObj
        }
      });
    }

    // If broadcastOnly is requested (e.g. from Doctor desk), do NOT play speech synthesis audio locally on Doctor's tab
    if (broadcastOnly) {
      console.log(`[VOICE ANNOUNCEMENT] Broadcast call sent to Reception desk for Token #${tokenNumber} (Local doctor speakers muted).`);
      return true;
    }

    this.queue.push(queueItem);

    if (!this.isSpeaking) {
      this.processNextAnnouncement();
    }
    return true;
  }

  /**
   * Replays the most recent consultation announcement stored in lastVoiceAnnouncement.
   */
  repeatLastAnnouncement() {
    if (!this.lastVoiceAnnouncement) {
      toast.error('No announcement available to replay.');
      return false;
    }

    const ann = { ...this.lastVoiceAnnouncement };
    return this.enqueueAnnouncement({
      tokenNumber: ann.token,
      patientName: ann.patientName,
      doctorName: ann.doctorName,
      mode: this.settings.languageMode || ann.languageMode || 'BOTH',
      isRepeat: true
    });
  }

  /**
   * Resolves Voice Parameters based on selected profile
   * Profile options: Professional (default), Gentle, Clear OPD
   */
  getProfileParameters() {
    const prof = this.settings.profile || 'Professional';
    if (prof === 'Gentle') {
      return { engRate: 0.84, engPitch: 1.02, tamRate: 0.84, tamPitch: 1.02, volume: 1.0 };
    }
    if (prof === 'Clear OPD') {
      return { engRate: 0.92, engPitch: 1.05, tamRate: 0.92, tamPitch: 1.05, volume: 1.0 };
    }
    // Professional (default)
    return { engRate: 0.88, engPitch: 1.0, tamRate: 0.88, tamPitch: 1.0, volume: 1.0 };
  }

  /**
   * Internal FIFO Queue Processor — Supports Browser, Sarvam AI, Azure, and Google Cloud Speech
   */
  async processNextAnnouncement() {
    if (this.queue.length === 0) {
      this.isSpeaking = false;
      return;
    }

    this.isSpeaking = true;
    const currentItem = this.queue.shift();

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();
      }

      const mode = currentItem.mode || this.settings.languageMode || 'BOTH';
      const provider = this.settings.provider || 'browser';
      const englishVoice = this.getBestEnglishVoice();
      const tamilVoice = this.getBestTamilVoice();

      const finishCurrent = () => {
        this.isSpeaking = false;
        setTimeout(() => {
          this.processNextAnnouncement();
        }, 100);
      };

      // Helper to speak Tamil utterance via Cloud API with automatic Browser fallback
      const speakTamilPart = async () => {
        if (provider === 'sarvam' || provider === 'azure' || provider === 'google') {
          const vId = provider === 'sarvam' ? (this.settings.sarvamVoiceId || 'ananya') : provider === 'azure' ? (this.settings.azureVoiceId || 'ta-IN-PallaviNeural') : (this.settings.googleVoiceId || 'ta-IN-Chirp3-HD-Aoede');
          const cloudOk = await this.playCloudAudio(currentItem.tamText, provider, vId);
          if (cloudOk) {
            finishCurrent();
            return;
          }
          console.warn(`[VOICE QUEUE] Cloud ${provider} synthesis failed/offline. Falling back to local browser TTS.`);
        }

        // Local Browser Tamil TTS Fallback / Default
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const uTamil = new SpeechSynthesisUtterance(currentItem.tamText);
          uTamil.lang = 'ta-IN';
          uTamil.rate = 0.88;
          uTamil.pitch = 1.0;
          uTamil.volume = 1.0;
          if (tamilVoice) uTamil.voice = tamilVoice;

          uTamil.onend = () => finishCurrent();
          uTamil.onerror = (err) => {
            console.warn('[VOICE QUEUE] Tamil browser utterance error:', err);
            finishCurrent();
          };

          window.speechSynthesis.speak(uTamil);
        } else {
          finishCurrent();
        }
      };

      if (mode === 'TA_ONLY') {
        await speakTamilPart();
      } else if (mode === 'EN_ONLY') {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const uEng = new SpeechSynthesisUtterance(currentItem.engText);
          uEng.lang = 'en-IN';
          uEng.rate = 0.88;
          uEng.pitch = 1.0;
          uEng.volume = 1.0;
          if (englishVoice) uEng.voice = englishVoice;

          uEng.onend = () => finishCurrent();
          uEng.onerror = () => finishCurrent();
          window.speechSynthesis.speak(uEng);
        } else {
          finishCurrent();
        }
      } else {
        // BOTH Mode (Default): English female voice first, then 400ms pause, then Tamil Cloud/Local voice
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const uEng = new SpeechSynthesisUtterance(currentItem.engText);
          uEng.lang = 'en-IN';
          uEng.rate = 0.88;
          uEng.pitch = 1.0;
          uEng.volume = 1.0;
          if (englishVoice) uEng.voice = englishVoice;

          let isEngFinished = false;
          const onEngFinish = async () => {
            if (isEngFinished) return;
            isEngFinished = true;
            await new Promise(r => setTimeout(r, 400));
            await speakTamilPart();
          };

          uEng.onend = onEngFinish;
          uEng.onerror = onEngFinish;

          window.speechSynthesis.speak(uEng);
        } else {
          await speakTamilPart();
        }
      }
    } catch (err) {
      console.error('[VOICE QUEUE] Exception in processNextAnnouncement:', err);
      this.isSpeaking = false;
      setTimeout(() => this.processNextAnnouncement(), 200);
    }
  }

  speakAnnouncement(announcementObj) {
    if (!announcementObj) return;
    this.enqueueAnnouncement(announcementObj);
  }
}

export const voiceAnnouncement = new VoiceAnnouncementService();
