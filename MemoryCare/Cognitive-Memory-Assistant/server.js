const express = require('express');
const path = require('path');
const { setupAiAssistantRoutes } = require('./server/aiAssistantBackend');
const { setupSyncBackendRoutes } = require('./server/syncBackend');

const app = express();
const port = Number(process.env.PORT || 3000);

// Set up AI Assistant backend endpoints
setupAiAssistantRoutes(app);

// Set up Offline-First SQLite Sync endpoints
setupSyncBackendRoutes(app);

// Serve static React build files if build folder exists
const buildPath = path.join(__dirname, 'build');
app.use(express.static(buildPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Unified MemoryCare & AI Assistant running on http://localhost:${port}`);
});
