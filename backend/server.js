require('./src/config/env');
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`=================================`);
      console.log(`Clinova Backend Server Running`);
      console.log(`Port: ${PORT}`);
      console.log(`Health Check: http://localhost:${PORT}/api/health`);
      console.log(`=================================`);
    });
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
