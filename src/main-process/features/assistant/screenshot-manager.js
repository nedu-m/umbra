const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');
const screenshot = require('screenshot-desktop');

const CLAUDE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CLAUDE_IMAGE_TARGET_BYTES = 4.5 * 1024 * 1024;

function createScreenshotManager({ app, getMainWindow, getAppEnvironment, sendToRenderer }) {
  let screenshots = [];
  let screenshotSequence = 0;
  let screenshotInProgress = false;

  function nextScreenshotId() {
    screenshotSequence += 1;
    return `ss-${Date.now()}-${screenshotSequence}`;
  }

  function normalizeScreenshotEntry(entry) {
    if (!entry) return null;

    if (typeof entry === 'string') {
      return {
        id: null,
        path: entry,
        timestamp: null
      };
    }

    if (typeof entry.path === 'string') {
      return {
        id: typeof entry.id === 'string' ? entry.id : null,
        path: entry.path,
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null
      };
    }

    return null;
  }

  function getScreenshotsDir() {
    return app.isPackaged
      ? path.join(app.getPath('userData'), '.stealth_screenshots')
      : path.join(__dirname, '..', '..', '..', '..', '.stealth_screenshots');
  }

  function ensureScreenshotsDir() {
    const screenshotsDir = getScreenshotsDir();
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    return screenshotsDir;
  }

  function cleanupScreenshotFile(entry) {
    const normalizedEntry = normalizeScreenshotEntry(entry);
    if (normalizedEntry && fs.existsSync(normalizedEntry.path)) {
      fs.unlinkSync(normalizedEntry.path);
    }
  }

  function detectImageMimeType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
      return null;
    }

    const isPng = (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    );

    if (isPng) {
      return 'image/png';
    }

    const isJpeg = (
      buffer[0] === 0xFF &&
      buffer[1] === 0xD8 &&
      buffer[2] === 0xFF
    );

    if (isJpeg) {
      return 'image/jpeg';
    }

    return null;
  }

  function buildClaudeInlineImageData(imagePath) {
    const originalBuffer = fs.readFileSync(imagePath);
    const detectedOriginalMimeType = detectImageMimeType(originalBuffer);

    if (originalBuffer.length <= CLAUDE_IMAGE_TARGET_BYTES) {
      return {
        inlineData: {
          data: originalBuffer.toString('base64'),
          mimeType: detectedOriginalMimeType || 'image/png'
        }
      };
    }

    const sourceImage = nativeImage.createFromPath(imagePath);
    if (sourceImage.isEmpty()) {
      throw new Error(`Failed to load screenshot image: ${imagePath}`);
    }

    const originalSize = sourceImage.getSize();
    const widthScaleFactors = [1, 0.85, 0.7, 0.55, 0.4];
    const jpegQualities = [90, 80, 70, 60, 50, 40];

    for (const scaleFactor of widthScaleFactors) {
      const resizedImage = scaleFactor === 1
        ? sourceImage
        : sourceImage.resize({
          width: Math.max(1, Math.round(originalSize.width * scaleFactor)),
          quality: 'good'
        });

      for (const quality of jpegQualities) {
        const jpegBuffer = resizedImage.toJPEG(quality);
        if (jpegBuffer.length <= CLAUDE_IMAGE_TARGET_BYTES) {
          return {
            inlineData: {
              data: jpegBuffer.toString('base64'),
              mimeType: 'image/jpeg'
            }
          };
        }
      }
    }

    throw new Error(
      `Screenshot is too large to analyze after compression: ${originalBuffer.length} bytes exceeds ${CLAUDE_IMAGE_MAX_BYTES} byte limit`
    );
  }

  async function takeStealthScreenshot() {
    if (screenshotInProgress) {
      console.log('Screenshot already in progress, skipping');
      return null;
    }

    const mainWindow = getMainWindow();
    const appEnvironment = getAppEnvironment();

    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window not available');
    }

    screenshotInProgress = true;
    try {
      console.log('Taking stealth screenshot...');
      const currentOpacity = mainWindow.getOpacity();
      const screenshotDelay = appEnvironment?.screenshotDelay || 300;

      mainWindow.setOpacity(0.01);
      await new Promise((resolve) => setTimeout(resolve, screenshotDelay));

      const screenshotsDir = ensureScreenshotsDir();
      const screenshotPath = path.join(screenshotsDir, `stealth-${Date.now()}.png`);

      await screenshot({ filename: screenshotPath });

      const screenshotEntry = {
        id: nextScreenshotId(),
        path: screenshotPath,
        timestamp: new Date().toISOString()
      };

      screenshots.push(screenshotEntry);
      if (screenshots.length > appEnvironment.maxScreenshots) {
        cleanupScreenshotFile(screenshots.shift());
      }

      mainWindow.setOpacity(currentOpacity);

      console.log(`Screenshot saved: ${screenshotPath}`);
      console.log(`Total screenshots: ${screenshots.length}`);

      sendToRenderer('screenshot-taken-stealth', {
        count: screenshots.length,
        screenshotId: screenshotEntry.id,
        timestamp: screenshotEntry.timestamp
      });

      return screenshotPath;
    } catch (error) {
      try {
        mainWindow.setOpacity(1.0);
      } catch (_) {
        // no-op
      }
      console.error('Stealth screenshot error:', error);
      throw error;
    } finally {
      screenshotInProgress = false;
    }
  }

  async function buildImagePartsFromScreenshots({ strict = true, includeIds = null } = {}) {
    const includeIdSet = Array.isArray(includeIds)
      ? new Set(includeIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
      : null;

    const usableEntries = [];

    for (const entry of screenshots) {
      const normalizedEntry = normalizeScreenshotEntry(entry);
      if (!normalizedEntry) continue;

      if (includeIdSet && (!normalizedEntry.id || !includeIdSet.has(normalizedEntry.id))) {
        continue;
      }

      if (fs.existsSync(normalizedEntry.path)) {
        usableEntries.push(normalizedEntry);
        continue;
      }

      console.error(`Screenshot file not found: ${normalizedEntry.path}`);
      if (strict) {
        throw new Error(`Screenshot file not found: ${normalizedEntry.path}`);
      }
    }

    const imageParts = usableEntries.map((entry) => buildClaudeInlineImageData(entry.path));

    return {
      imageParts,
      entries: usableEntries
    };
  }

  function clearStealth() {
    screenshots.forEach((entry) => {
      cleanupScreenshotFile(entry);
    });

    screenshots = [];
    screenshotSequence = 0;

    console.log('All screenshots and context cleared');
    return { success: true };
  }

  function cleanupTransientResources() {
    screenshots.forEach((entry) => {
      cleanupScreenshotFile(entry);
    });

    screenshots = [];
    screenshotSequence = 0;
  }

  function getScreenshotsCount() {
    return screenshots.length;
  }

  function hasScreenshots() {
    return screenshots.length > 0;
  }

  return {
    buildImagePartsFromScreenshots,
    cleanupTransientResources,
    clearStealth,
    getScreenshotsCount,
    hasScreenshots,
    takeStealthScreenshot
  };
}

module.exports = {
  createScreenshotManager
};
