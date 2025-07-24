import { promises as fs } from "fs";
// Ensure necessary directories exist
async function ensureDirectoriesExist(): Promise<void> {
  const dirs = ["/tmp", "/tmp/screenshots", "/tmp/.cache"];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      // Ensure permissions
      await fs.chmod(dir, 0o777);
    } catch (err: any) {
      console.log(
        `Note: Directory ${dir} already exists or couldn't be created: ${err.message}`
      );
    }
  }
}

export { ensureDirectoriesExist };
