// Create clipboard buffer
let clipboardBuffer;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  // Create clipboard buffer textarea
  clipboardBuffer = document.createElement('textarea');
  clipboardBuffer.id = 'clipboardBuffer';
  document.body.appendChild(clipboardBuffer);

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.target !== 'offscreen') return;

    // Handle clipboard write
    if (message.action === 'copy') {
      writeToClipboard(message.text, message.extendedMime);
      sendResponse({ success: true });
    }
    
    // Handle clipboard read
    if (message.action === 'paste') {
      const text = await readFromClipboard();
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'paste-result',
        text: text
      });
      sendResponse({ text: text });
    }

    // Close the offscreen document when done
    // Wait a bit to ensure the clipboard operation completes
    setTimeout(() => {
      // Send message to close the offscreen document when done
      chrome.runtime.sendMessage({ type: 'offscreen-close' });
    }, 1000);
  });
});

// Write to clipboard
function writeToClipboard(text, extendedMime) {
  if (!text) text = '<empty>';
  
  // Default copy via clipboardBuffer
  clipboardBuffer.value = text;
  clipboardBuffer.select();
  
  // Copy via API (clipboardData)
  var oncopyBackup = document.oncopy;
  document.oncopy = function(e) {
    // If we don't use html MIME type, exit immediately to let the default method (clipboardBuffer) handle it
    if (typeof extendedMime === "undefined" || extendedMime !== true) {
      return;
    }
    e.preventDefault();
    e.clipboardData.setData("text/html", text);
    e.clipboardData.setData("text/plain", text);
  };
  document.execCommand('copy');
  document.oncopy = oncopyBackup;
}

// Read from clipboard
async function readFromClipboard() {
  clipboardBuffer.value = '';
  clipboardBuffer.select();
  document.execCommand('paste');
  return clipboardBuffer.value;
}