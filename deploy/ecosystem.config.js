// PM2 配置文件
// 用法: pm2 start ecosystem.config.js

module.exports = {
  apps: [{
    name: "stzh",
    script: "./start.js",
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      PORT: 80,
    },
  }],
};
