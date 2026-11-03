const { execSync } = require('child_process');

const port = process.env.PORT || 5000;

try {
  if (process.platform === 'win32') {
    const output = execSync(`netstat -ano | findstr :${port}`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    const lines = output.split('\n');
    const pids = new Set();
    for (const line of lines) {
      if (/LISTENING/i.test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && parseInt(pid, 10) !== process.pid) {
          pids.add(pid);
        }
      }
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        console.log(`[free-port] Successfully cleared zombie process PID ${pid} on port ${port}`);
      } catch (e) {}
    }
  } else {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
  }
} catch (e) {
  // Port is free
}
