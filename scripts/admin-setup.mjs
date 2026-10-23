import { readFile, writeFile } from "node:fs/promises";
import { hashPassword } from "../server/auth.mjs";
if (!process.stdin.isTTY) {
  console.error(
    "Run this command in your terminal to set a password privately.",
  );
  process.exit(1);
}
process.stdout.write("Choose an admin password (12+ characters): ");
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
let password = "";
process.stdin.on("data", async (chunk) => {
  for (const c of chunk) {
    if (c === "\u0003") {
      process.stdout.write("\n");
      process.exit(1);
    }
    if (c === "\r" || c === "\n") {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (password.length < 12) {
        console.error("Use at least 12 characters. Run setup again.");
        process.exit(1);
      }
      let env = "";
      try {
        env = await readFile(".env", "utf8");
      } catch {}
      env = env
        .split("\n")
        .filter((l) => !l.startsWith("ADMIN_PASSWORD_HASH="))
        .join("\n");
      await writeFile(
        ".env",
        env.trim() + "\nADMIN_PASSWORD_HASH=" + hashPassword(password) + "\n",
        { mode: 0o600 },
      );
      console.log(
        "Admin password saved securely. Restart the server and visit /admin.",
      );
      process.exit(0);
    } else if (c === "\u007f") {
      password = password.slice(0, -1);
    } else if (c >= " ") {
      password += c;
    }
  }
});
