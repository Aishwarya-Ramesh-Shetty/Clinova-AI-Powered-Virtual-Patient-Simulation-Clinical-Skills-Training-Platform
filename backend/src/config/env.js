const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env in backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
