// Background service worker

// Register the offscreen document for clipboard operations
chrome.runtime.onStartup.addListener(async () => {
  try {
    await createOffscreenDocumentIfNeeded();
  } catch (e) {
    // Error in onStartup
  }
});

// Also prepare the offscreen document when the extension is installed or updated
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await createOffscreenDocumentIfNeeded();
  } catch (e) {
    // Error in onInstalled
  }
});

// Create a dummy jQuery implementation for service worker
// Default config values
const defaults = {
  format: 'text',
  anchor: 'url',
  highlighted_tab_only: false,
  mime: 'plaintext',
  intelligent_paste: false,
  walk_all_windows: true
};

// Simple in-memory settings object
const config = { ...defaults };

const $ = {
  each: function(arr, callback) {
    if (Array.isArray(arr)) {
      for (let i = 0; i < arr.length; i++) {
        callback(i, arr[i]);
      }
    } else {
      for (let key in arr) {
        callback(key, arr[key]);
      }
    }
  },
  trim: function(str) {
    return str ? str.trim() : '';
  }
};

// String trimming utility
function trim(str) {
  return str ? str.trim() : '';
}

/**
* Clipboard access handler
* (Need to use background page for access, ref: http://stackoverflow.com/questions/6925073/copy-paste-not-working-in-chrome-extension)
*/
const Clipboard = {
  /**
  * Writes the string to clipboard (Copy function)
  * 
  * We don't have direct clipboard access via Chrome API,
  * so in MV3 we'll create a temporary offscreen document to handle clipboard operations
  *
  * @param {String} str String to copy to clipboard
  * @param {Boolean} extended_mime Indicates if we should copy the MIME type text/html in addition to plain text
  */
  write: async function(str, extended_mime) {
    if (str === '' || str === undefined) {
      str = '<empty>';
    }
    
    try {
      // Use offscreen document for clipboard operations in MV3
      await createOffscreenDocumentIfNeeded();
      
      // Send message to offscreen document to write to clipboard
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'copy',
        text: str,
        extendedMime: extended_mime
      });
    } catch (e) {
      // Clipboard write error
    }
  },
  
  /**
  * Returns clipboard content (String)
  */
  read: async function() {
    try {
      // Use offscreen document for clipboard operations in MV3
      await createOffscreenDocumentIfNeeded();
      
      // Send message to offscreen document to read from clipboard
      // In MV3, this will be asynchronous, so we need to handle it differently
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'paste'
        }, (response) => {
          resolve(response?.text || '');
        });
      });
    } catch (e) {
      // Clipboard read error
      return '';
    }
  }
};

// Function to create offscreen document if it doesn't exist
async function createOffscreenDocumentIfNeeded() {
  try {
    // Check if offscreen document exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (existingContexts.length > 0) {
      // Offscreen document already exists
      return;
    }
    
    // Create an offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Clipboard access for extension'
    });
  } catch (error) {
    // Error creating offscreen document
  }
}

/**
* Object that manages actions (click on feature links in popup.html)
*/
const Action = {
  /**
  * Copies URLs from the given window to clipboard
  * @param {Object} opt.window Window from which to copy URLs
  * @param {Object} opt.gaEvent Data needed for ga event generation (action, label, actionMeta)
  * @returns {Object} Result object with tab count
  */
  copy: function(opt) {
    let tabCount = 0;
    
    try {
      // Get the "walk all windows" setting from message or use default
      let getAllWindows = true; // Default to true
      if (opt.message && typeof opt.message.allWindows !== 'undefined') {
        getAllWindows = opt.message.allWindows;
      }
      
      // Create query - if getAllWindows is true, we don't specify a windowId
      // If false, use the provided window or current window
      let tabQuery = {};
      if (!getAllWindows && opt.window && opt.window.id) {
        tabQuery.windowId = opt.window.id;
      }
      
      // Use synchronous approach for service worker
      chrome.tabs.query(tabQuery, (tabs) => {
        try {
          // Use default configuration
          const format = 'text';  // Always use text format
          const highlighted_tab_only = false; // Don't filter by highlighted
          const extended_mime = false; // Don't use HTML mime
          let outputText = '';
          
          // Filter tabs if needed (default is false)
          let tabs_filtered = highlighted_tab_only ? 
            tabs.filter(tab => tab.highlighted) : 
            tabs;
            
          tabCount = tabs_filtered.length;
          
          // Always use text format for simplicity
          outputText = CopyTo.text(tabs_filtered);
          
          // Copy URL list to clipboard
          Clipboard.write(outputText, extended_mime);
          
          // Indicate to popup the number of copied URLs, for display in popup
          chrome.runtime.sendMessage({type: "copy", copied_url: tabCount});
          
          // No analytics tracking
        } catch (e) {
          // Error processing tabs
        }
      });
    } catch (e) {
      // Error in copy function
    }
    
    return { count: tabCount };
  },
  
  /**
  * Opens all URLs from clipboard in new tabs
  * @param {Object} opt.gaEvent Data needed for ga event generation (action, label, actionMeta)
  * @returns {Object} Result object with count of URLs pasted
  */
  paste: async function(opt) {
    let urlCount = 0;
    
    try {
      const clipboardString = await Clipboard.read();
      
      // Extract URLs, either line by line or intelligent paste
      let urlList;
      const useIntelligentPaste = opt.message && opt.message.intelligent === true;
      
      if (useIntelligentPaste) {
        urlList = clipboardString.match(/(https?|ftp|ssh|mailto):\/\/[a-z0-9\/:%_+.,#?!@&=-]+/gi);
      } else {
        urlList = clipboardString.split("\n");
      }
      
      // If urlList is empty, show error message and exit
      if (!urlList) {
        chrome.runtime.sendMessage({type: "paste", errorMsg: "No URL found in the clipboard"});
        return { count: 0, error: "No URL found in the clipboard" };
      }
      
      // Extract URL for lines in HTML format (<a...>#url</a>)
      $.each(urlList, function(key, val) {
        const matches = val.match(new RegExp('<a[^>]+href="([^"]+)"', 'i'));
        try {
          if (matches && matches[1]) {
            urlList[key] = matches[1];
          }
        } catch(e) {
          // Error extracting URL from HTML
        }
        
        urlList[key] = trim(urlList[key]);
      });
      
      // Remove non-conforming URLs
      urlList = urlList.filter(function(url) {
        return url !== "" && url !== undefined;
      });
      
      urlCount = urlList.length;
      
      // Open all URLs in tabs
      $.each(urlList, function(key, val) {
        chrome.tabs.create({url: val});
      });
      
      // Tell popup to close
      chrome.runtime.sendMessage({type: "paste"});
      
      // No analytics tracking
    } catch (e) {
      // Error in paste function
      return { count: 0, error: e.message };
    }
    
    return { count: urlCount };
  }
};

/**
* URL copying functions for various formats
*/
const CopyTo = {
  // Copy tab URLs in text format
  text: function(tabs) {
    let s = '';
    for (let i = 0; i < tabs.length; i++) {
      s += tabs[i].url + '\n';
    }
    return s;
  },
};

/**
* Update notification
*/
const UpdateManager = {
  /** Information filled by the callback runtime.onInstalled */
  runtimeOnInstalledStatus: null,
  
  /** (bool) Indicates if an extension update occurred recently */
  recentUpdate: function() {
    // Always return false since we don't store update time anymore
    return false;
  },
  
  /** Sets badge if an update occurred recently */
  setBadge: function() {
    if (!UpdateManager.recentUpdate()) {
      chrome.action.setBadgeText({text: ''});
      return;
    }
    chrome.action.setBadgeText({text: 'NEW'});
  }
};

UpdateManager.setBadge();

chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason !== 'update') {
    UpdateManager.runtimeOnInstalledStatus = "Not an update (" + details.reason + ")";
    return;
  }
  
  if (details.previousVersion === chrome.runtime.getManifest().version) {
    UpdateManager.runtimeOnInstalledStatus = "Same version (" + details.previousVersion + ")";
    return;
  }
  
  // Don't store update information
  UpdateManager.runtimeOnInstalledStatus = "Updated";
  
  // Update badge
  UpdateManager.setBadge();
  
  // No analytics tracking
  
  // Display notification
  chrome.notifications.create("cpau_update_notification", {
    type: "basic",
    title: "Copy All Urls updated",
    message: "New version installed: " + chrome.runtime.getManifest().version + ". Click to see new features.",
    iconUrl: "img/umbrella_128.png"
  });
  
  chrome.notifications.onClicked.addListener(function(notificationId) {
    if (notificationId === "cpau_update_notification") {
      chrome.tabs.create({url: 'http://finalclap.github.io/CopyAllUrl_Chrome/'});
    }
  });
});

// Listen for messages from the popup, options page, and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Handle messages from the offscreen document
  if (message.target === 'background' && message.action === 'paste-result') {
    sendResponse({text: message.text});
    return true;
  }

  // Handle checkRecentUpdate request from popup or options
  if (message.action === "checkRecentUpdate") {
    sendResponse({recentUpdate: UpdateManager.recentUpdate()});
    return true;
  }

  // Handle copy action from popup
  if (message.action === "copy") {
    try {
      // Get the current window if not provided
      if (!message.window || !message.window.id) {
        chrome.windows.getCurrent(function(win) {
          const result = Action.copy({
            window: win,
            message: message
          });
          sendResponse({success: true, count: result.count});
        });
      } else {
        const result = Action.copy({
          window: message.window,
          message: message
        });
        sendResponse({success: true, count: result.count});
      }
    } catch (e) {
      // Error handling copy action
      sendResponse({success: false, error: e.message});
    }
    return true;
  }

  // Handle paste action from popup
  if (message.action === "paste") {
    try {
      try {
        const result = Action.paste({
          message: message
        });
        sendResponse({success: true, count: result.count});
      } catch (e) {
        // Error in paste operation
        sendResponse({success: false, error: e.message || "Error pasting URLs"});
      }
    } catch (e) {
      // Error handling paste action
      sendResponse({success: false, error: e.message});
    }
    return true;
  }
  
  return true;
});