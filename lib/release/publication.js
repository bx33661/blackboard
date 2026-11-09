import fs from 'node:fs';
import path from 'node:path';

// Keep the publication error as the thrown object, including its filesystem
// code. Cleanup failures add recovery details instead of hiding that cause.
function cleanupFailedStaging(staging, error, recursive) {
  try {
    fs.rmSync(staging, { recursive, force: true });
  } catch (cleanupError) {
    error.cleanupErrors = [{ path: staging, error: cleanupError }];
    error.message += `; failed to clean up temporary path ${staging}: ${cleanupError.message}`;
  }
}

/** Copy every published file before replacing an installed version. */
export function publishPackage({ source, files, dest, info }) {
  const versions = path.dirname(dest);
  const version = path.basename(dest);
  const staging = path.join(versions, `.${version}.staging-${process.pid}`);
  const retired = path.join(versions, `.${version}.replaced-${process.pid}`);
  // A previous failed rollback or cleanup may have left the only old copy here.
  // Never overwrite it, even if the destination is currently absent.
  if (fs.existsSync(retired)) {
    const error = new Error(`The retained old-version directory already exists: ${retired}; restore or clean up that directory before installing ${dest}`);
    error.recoveryPath = retired;
    throw error;
  }
  fs.mkdirSync(versions, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  let movedOldVersion = false;
  try {
    for (const entry of ['package.json', ...files]) {
      const from = path.join(source, entry);
      if (!fs.existsSync(from)) throw new Error(`Package file is missing: ${entry}`);
      fs.cpSync(from, path.join(staging, entry), { recursive: true });
    }
    fs.writeFileSync(path.join(staging, '.release.json'), JSON.stringify(info, null, 2));
    if (fs.existsSync(dest)) {
      fs.renameSync(dest, retired);
      movedOldVersion = true;
    }
    fs.renameSync(staging, dest);
  } catch (error) {
    if (movedOldVersion) {
      try {
        fs.renameSync(retired, dest);
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        error.recoveryPath = retired;
        error.message += `; the old version is retained at ${retired}; restoration to ${dest} failed: ${rollbackError.message}`;
      }
    }
    cleanupFailedStaging(staging, error, true);
    throw error;
  }

  const warnings = [];
  if (movedOldVersion) {
    try {
      fs.rmSync(retired, { recursive: true, force: true });
    } catch (error) {
      // Publication already succeeded. Report leftover old bytes without
      // turning a complete, active replacement into a failed installation.
      warnings.push(`Version installed, but cleanup of the old-version directory ${retired} failed: ${error.message}`);
    }
  }
  return warnings;
}

/** Publish a junction on Windows; POSIX keeps its atomic symlink replacement. */
export function publishCurrentLink(link, dest) {
  const staging = `${link}.staging-${process.pid}`;
  const retired = `${link}.replaced-${process.pid}`;
  let movedOldLink = false;
  if (process.platform === 'win32') {
    try {
      fs.lstatSync(retired);
      const error = new Error(`The old current link is retained at ${retired}; restore or clean it up before switching versions`);
      error.recoveryPath = retired;
      throw error;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  fs.rmSync(staging, { force: true });
  try {
    if (process.platform === 'win32') {
      // Junctions need no Developer Mode/admin symlink privilege. Windows
      // cannot rename a directory junction over an existing directory junction.
      fs.symlinkSync(path.resolve(dest), staging, 'junction');
      try {
        if (!fs.lstatSync(link).isSymbolicLink()) throw new Error(`current is not a managed link: ${link}`);
        fs.renameSync(link, retired);
        movedOldLink = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    } else fs.symlinkSync(path.relative(path.dirname(link), dest), staging);
    fs.renameSync(staging, link);
  } catch (error) {
    if (movedOldLink) {
      try {
        fs.renameSync(retired, link);
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        error.recoveryPath = retired;
        error.message += `; the old current link is retained at ${retired}; restoration failed: ${rollbackError.message}`;
      }
    }
    cleanupFailedStaging(staging, error, false);
    throw error;
  }
  const warnings = [];
  if (movedOldLink) {
    try {
      fs.rmSync(retired, { force: true });
    } catch (error) {
      warnings.push(`current switched, but cleanup of the old link ${retired} failed: ${error.message}`);
    }
  }
  return warnings;
}
