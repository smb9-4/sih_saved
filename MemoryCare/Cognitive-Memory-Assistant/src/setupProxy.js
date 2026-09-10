const { setupAiAssistantRoutes } = require('../server/aiAssistantBackend');

module.exports = function(app) {
  setupAiAssistantRoutes(app);
};
