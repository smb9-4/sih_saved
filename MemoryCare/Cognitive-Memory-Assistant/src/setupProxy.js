const { setupAiAssistantRoutes } = require('../server/aiAssistantBackend');
const { setupSyncBackendRoutes } = require('../server/syncBackend');

module.exports = function(app) {
  setupAiAssistantRoutes(app);
  setupSyncBackendRoutes(app);
};
