const { spawn } = require("child_process");
const electronPath = require("electron");
const path = require("path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [path.join(__dirname, "main.cjs")], {
  env,
  stdio: "inherit",
  windowsHide: false
});

child.on("exit", code => process.exit(code ?? 0));
