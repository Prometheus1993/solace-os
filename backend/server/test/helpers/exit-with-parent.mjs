// Test-only preload for the server spawned by server-validation.test.ts: exit as soon as the test run that
// started it is gone, so an aborted run can never leave a server (and its port) behind. Never loaded by the
// real server.
//
// Two independent signals, because either alone is not enough:
// - stdin EOF: the test hands the server a stdin pipe, and the OS closes it when the process holding the
//   other end dies.
// - watched pids: vitest runs test files in a forked worker. When only the vitest MAIN process is killed,
//   that worker lingers as an orphan, keeps the pipe open, and never reaches afterAll (measured
//   2026-09-13). So the test also passes its own pid and its parent's (worker + vitest main in forks mode,
//   main + launcher in threads mode), and the server exits when any of them disappears.
const exit = () => process.exit(0);
process.stdin.on('end', exit);
process.stdin.on('error', exit);
process.stdin.resume();

const watched = (process.env.SOLACE_TEST_WATCH_PIDS ?? '')
  .split(',')
  .map(Number)
  .filter((pid) => Number.isInteger(pid) && pid > 1);

if (watched.length > 0) {
  setInterval(() => {
    for (const pid of watched) {
      try {
        process.kill(pid, 0); // signal 0 = existence check only, sends nothing
      } catch (err) {
        if (err && err.code === 'ESRCH') exit(); // gone; EPERM would mean alive but not ours
      }
    }
  }, 500).unref();
}
