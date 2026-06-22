module.exports = {
  apps: [
    {
      name: "cashflow-agent",
      cwd: "/root/2604/cashflow-agent",
      script: "node_modules/.bin/next",
      args: "start -p 3099",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: "file:/root/2604/cashflow-agent/prisma/dev.db",
      },
      error_file: "/root/2604/cashflow-agent/logs/error.log",
      out_file: "/root/2604/cashflow-agent/logs/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};