const express = require('express');
const router = express.Router();
const { 
  login, 
  logout, 
  getProfile, 
  createUser, 
  changePin, 
  setPin,
  registerHospital
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validateMobileNumber, checkUserMobileUniqueness } = require('../middleware/validation');

// Public routes for authentication
router.post('/login', login);
router.post('/register-hospital', validateMobileNumber, registerHospital);

// Protected routes (require JWT verification)
router.post('/logout', protect, logout);
router.get('/profile', protect, getProfile);
router.post('/create-user', protect, validateMobileNumber, checkUserMobileUniqueness, createUser);
router.post('/change-pin', protect, changePin);
router.post('/set-pin', protect, setPin);

module.exports = router;
