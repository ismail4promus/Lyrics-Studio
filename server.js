require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const PORT = process.env.PORT || 3000;
let server;

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    // Fail fast: a server that can't reach its database on startup should not report itself
    // as healthy. Let the process manager (pm2, systemd, Docker restart policy, ...) restart it
    // once the database is reachable, instead of staying up and serving broken requests.
    console.error('MongoDB connection failed — exiting:', err.message);
    process.exit(1);
  }

  server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully.`);

  const closeServer = () => new Promise((resolve) => (server ? server.close(resolve) : resolve()));

  closeServer()
    .then(() => mongoose.connection.close())
    .then(() => {
      console.log('Shutdown complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error during shutdown:', err);
      process.exit(1);
    });

  // Belt-and-suspenders: force-exit if something above hangs.
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

start();
