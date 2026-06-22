// PM2 ecosystem file
module.exports = {
  apps: [{
    name: "taxassist",
    script: "node_modules/next/dist/bin/next-start",
    args: "start",
    cwd: "/root/2604/taxassist",
    env: {
      NODE_ENV: "production",
      PORT: 3434,
      NEXT_DIST_DIR: ".next-prod",
    },
    env_file: ".env.production",
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "500M",
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    error_file: "/root/2604/taxassist/logs/error.log",
    out_file: "/root/2604/taxassist/logs/out.log",
    merge_logs: true,
  }]
};
