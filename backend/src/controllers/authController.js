const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendResponse } = require('../utils/helpers');

const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET || 'clinova_jwt_secret_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, dateOfBirth, gender, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Name, email, and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'User already exists'
      });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      phone,
      dateOfBirth,
      gender,
      address
    });

    const token = generateToken(user._id, user.email);

    sendResponse(
      res,
      201,
      {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      },
      'Registration successful'
    );
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Invalid credentials'
      });
    }

    const token = generateToken(user._id, user.email);

    sendResponse(
      res,
      200,
      {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      },
      'Login successful'
    );
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    sendResponse(
      res,
      200,
      {
        user: req.user
      },
      'User profile retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

exports.generateToken = generateToken;
