module.exports = {
  apps: [{
    name: 'dialogue-gateway',
    script: 'server.js',
    cwd: '/home/ubuntu/gateway',
    env: {
      PORT: 3200,
      DOUBAO_APP_ID: '3470071173',
      DOUBAO_ACCESS_TOKEN: '9izMAKyW6M2wkKY3pm9gF1rL9jUdzgrY',
      DOUBAO_APP_KEY: 'PlgvMymc7f3tQnJ6',
      DOUBAO_INPUT_MOD: 'text'
    }
  }]
};
