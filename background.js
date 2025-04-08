// Log initialization of service worker
console.log('Background service worker starting up');

// Define a simple HTML encoding function to replace Encoder.js
const htmlEntityEncoder = {
  htmlEncode: function(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  EncodeType: "entity"
};

// Register the offscreen document for clipboard operations
chrome.runtime.onStartup.addListener(async () => {
  console.log('onStartup triggered');
  try {
    await createOffscreenDocumentIfNeeded();
  } catch (e) {
    console.error('Error in onStartup:', e);
  }
});

// Also prepare the offscreen document when the extension is installed or updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('onInstalled triggered:', details);
  try {
    await createOffscreenDocumentIfNeeded();
  } catch (e) {
    console.error('Error in onInstalled:', e);
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
      console.error('Clipboard write error:', e);
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
      console.error('Clipboard read error:', e);
      return '';
    }
  }
};

// Function to create offscreen document if it doesn't exist
async function createOffscreenDocumentIfNeeded() {
  console.log('Creating offscreen document if needed');
  try {
    // Check if offscreen document exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    console.log('Existing contexts:', existingContexts);
    
    if (existingContexts.length > 0) {
      console.log('Offscreen document already exists, not creating a new one');
      return;
    }
    
    console.log('Creating new offscreen document');
    
    // Create an offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Clipboard access for extension'
    });
    
    console.log('Offscreen document created successfully');
  } catch (error) {
    console.error('Error creating offscreen document:', error);
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
        console.log("Walk all windows setting from message:", getAllWindows);
      } else {
        console.log("Using default walk all windows setting:", getAllWindows);
      }
      
      // Create query - if getAllWindows is true, we don't specify a windowId
      // If false, use the provided window or current window
      let tabQuery = {};
      if (!getAllWindows && opt.window && opt.window.id) {
        tabQuery.windowId = opt.window.id;
      }
      
      console.log("Tab query:", tabQuery);
      
      // Use synchronous approach for service worker
      chrome.tabs.query(tabQuery, (tabs) => {
        try {
          console.log("Got tabs:", tabs.length);
          
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
          
          console.log("Filtered tabs:", tabCount);
          
          // Always use text format for simplicity
          outputText = CopyTo.text(tabs_filtered);
          
          // Copy URL list to clipboard
          Clipboard.write(outputText, extended_mime);
          
          // Indicate to popup the number of copied URLs, for display in popup
          chrome.runtime.sendMessage({type: "copy", copied_url: tabCount});
          
          // Tracking event - replaced by more modern tracking in MV3
          trackEvent('Action', opt.gaEvent.action, opt.gaEvent.label, tabCount);
        } catch (e) {
          console.error("Error processing tabs:", e);
        }
      });
    } catch (e) {
      console.error("Error in copy function:", e);
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
      console.log("Read from clipboard:", clipboardString ? "Content available" : "Empty");
      
      // Extract URLs, either line by line or intelligent paste
      let urlList;
      if (localStorage["intelligent_paste"] === "true") {
        urlList = clipboardString.match(/(https?|ftp|ssh|mailto):\/\/[a-z0-9\/:%_+.,#?!@&=-]+/gi);
      } else {
        urlList = clipboardString.split("\n");
      }
      
      // If urlList is empty, show error message and exit
      if (!urlList) {
        chrome.runtime.sendMessage({type: "paste", errorMsg: "No URL found in the clipboard"});
        return { count: 0, error: "No URL found in the clipboard" };
      }
      
      console.log("Raw URL list:", urlList.length);
      
      // Extract URL for lines in HTML format (<a...>#url</a>)
      $.each(urlList, function(key, val) {
        const matches = val.match(new RegExp('<a[^>]+href="([^"]+)"', 'i'));
        try {
          if (matches && matches[1]) {
            urlList[key] = matches[1];
          }
        } catch(e) {
          console.error("Error extracting URL from HTML:", e);
        }
        
        urlList[key] = trim(urlList[key]);
      });
      
      // Remove non-conforming URLs
      urlList = urlList.filter(function(url) {
        return url !== "" && url !== undefined;
      });
      
      urlCount = urlList.length;
      console.log("Filtered URL list:", urlCount);
      
      // Open all URLs in tabs
      $.each(urlList, function(key, val) {
        chrome.tabs.create({url: val});
      });
      
      // Tell popup to close
      chrome.runtime.sendMessage({type: "paste"});
      
      // Tracking event - replaced by more modern tracking in MV3
      trackEvent('Action', opt.gaEvent.action, opt.gaEvent.label, urlCount);
    } catch (e) {
      console.error("Error in paste function:", e);
      return { count: 0, error: e.message };
    }
    
    return { count: urlCount };
  }
};

/**
* URL copying functions for various formats
*/
const CopyTo = {
  // Copy tab URLs in html format
  html: function(tabs) {
    const anchor = localStorage['anchor'] ? localStorage['anchor'] : 'url';
    let s = '';
    
    for (let i = 0; i < tabs.length; i++) {
      let row_anchor = tabs[i].url;
      if (anchor === 'title') {
        try {
          row_anchor = htmlEntityEncoder.htmlEncode(tabs[i].title);
        } catch(ex) {
          row_anchor = tabs[i].title;
        }
      }
      s += '<a href="' + tabs[i].url + '">' + row_anchor + '</a><br/>\n';
    }
    return s;
  },
  
  // Copy tab URLs in custom format
  custom: function(tabs) {
    const template = (localStorage['format_custom_advanced'] && localStorage['format_custom_advanced'] !== '') 
      ? localStorage['format_custom_advanced'] 
      : null;
      
    if (template === null) {
      return 'ERROR: Row template is empty! (see options page)';
    }
    
    let s = '';
    for (let i = 0; i < tabs.length; i++) {
      let current_row = template;
      const current_url = tabs[i].url;
      const current_title = tabs[i].title;
      
      // Replace variables in template
      current_row = current_row.replace(/\$url/gi, current_url);
      current_row = current_row.replace(/\$title/gi, current_title);
      
      s += current_row;
    }
    return s;
  },
  
  // Copy tab URLs in text format
  text: function(tabs) {
    let s = '';
    for (let i = 0; i < tabs.length; i++) {
      s += tabs[i].url + '\n';
    }
    return s;
  },
  
  // Copy tab URLs in JSON format
  json: function(tabs) {
    const data = [];
    for (let i = 0; i < tabs.length; i++) {
      data.push({url: tabs[i].url, title: tabs[i].title});
    }
    return JSON.stringify(data);
  }
};

/**
* Update notification
*/
const UpdateManager = {
  /** Information filled by the callback runtime.onInstalled */
  runtimeOnInstalledStatus: null,
  
  /** (bool) Indicates if an extension update occurred recently */
  recentUpdate: function() {
    try {
      const timeDiff = new Date().getTime() - new Date(parseInt(localStorage['update_last_time'])).getTime();
      if (timeDiff < 1000 * 3600 * 24) {
        return true;
      }
    } catch (ex) {}
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
  
  // Save update date
  localStorage['update_last_time'] = new Date().getTime();
  localStorage['update_previous_version'] = details.previousVersion;
  UpdateManager.runtimeOnInstalledStatus = "Updated";
  
  // Update badge
  UpdateManager.setBadge();
  
  // Track event
  trackEvent('Lifecycle', 'Update', details.previousVersion);
  
  // Display notification
  chrome.notifications.create("cpau_update_notification", {
    type: "basic",
    title: "Copy All Urls updated",
    message: "New version installed: " + chrome.runtime.getManifest().version + ". Click to see new features.",
    iconUrl: "img/umbrella_128.png"
  });
  
  chrome.notifications.onClicked.addListener(function(notificationId) {
    if (notificationId === "cpau_update_notification") {
      trackEvent('Internal link', 'Notification', 'http://finalclap.github.io/CopyAllUrl_Chrome/');
      chrome.tabs.create({url: 'http://finalclap.github.io/CopyAllUrl_Chrome/'});
    }
  });
});

/**
* Web analytics utility functions
*/
const AnalyticsHelper = {
  /** Function to get extension key to retrieve info (like version) */
  getChromeExtensionKey: function() {
    try {
      const url = chrome.runtime.getURL('stop');
      const matches = url.match(new RegExp("[a-z0-9_-]+://([a-z0-9_-]+)/stop", "i"));
      return (matches && matches[1]) ? matches[1] : chrome.runtime.id;
    } catch (e) {
      return chrome.runtime.id;
    }
  },
  
  /** Returns a string (serialized json object) with plugin configuration info */
  getShortSettings: function(settings) {
    if (settings === undefined) {
      settings = localStorage;
    }
    
    const shortSettings = {
      fm: localStorage['format'] ? localStorage['format'] : 'text',
      an: localStorage['anchor'] ? localStorage['anchor'] : 'url',
      da: localStorage['default_action'] ? localStorage['default_action'] : "menu",
      mm: localStorage['mime'] ? localStorage['mime'] : 'plaintext',
      hl: localStorage['highlighted_tab_only'] === "true" ? 1 : 0,
      ip: localStorage['intelligent_paste'] === "true" ? 1 : 0,
      ww: localStorage['walk_all_windows'] === "true" ? 1 : 0
    };
    
    return AnalyticsHelper.serialize(shortSettings);
  },
  
  /** Returns configuration extract for tracking Action category events */
  getActionMeta: function(action) {
    let shortSettings = {};
    
    switch(action) {
      case "copy":
        shortSettings = {
          fm: localStorage['format'] ? localStorage['format'] : 'text',
          an: localStorage['anchor'] ? localStorage['anchor'] : 'url',
          mm: localStorage['mime'] ? localStorage['mime'] : 'plaintext',
          hl: localStorage['highlighted_tab_only'] === "true" ? 1 : 0,
          ww: localStorage['walk_all_windows'] === "true" ? 1 : 0
        };
        break;
      case "paste":
        shortSettings = {
          ip: localStorage['intelligent_paste'] === "true" ? 1 : 0
        };
        break;
    }
    return AnalyticsHelper.serialize(shortSettings);
  },
  
  /** Serializes an object for transmission to analytics. data must be an array (array or object) */
  serialize: function(data) {
    const chunks = [];
    for (const i in data) {
      chunks.push(i + ":" + data[i]);
    }
    return chunks.join(",");
  }
};

// Setup a lightweight analytics system
const _gaq = [];
_gaq.push(['_setAccount', 'UA-30512078-5']);

// Simple analytics tracking function
function trackEvent(category, action, label, value) {
  // In MV3, we would use a more modern analytics approach
  console.log('Track event:', category, action, label, value);
  // In service worker, just log the event - no analytics
  // Real implementation would use a different analytics approach compatible with service workers
}

// Listen for messages from the popup, options page, and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
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
          const gaEvent = message.gaEvent || {
            action: 'Copy',
            label: 'SimplePopup',
            actionMeta: 'simple'
          };
          const result = Action.copy({window: win, gaEvent: gaEvent});
          sendResponse({success: true, count: result.count});
        });
      } else {
        const result = Action.copy({window: message.window, gaEvent: message.gaEvent});
        sendResponse({success: true, count: result.count});
      }
    } catch (e) {
      console.error("Error handling copy action:", e);
      sendResponse({success: false, error: e.message});
    }
    return true;
  }

  // Handle paste action from popup
  if (message.action === "paste") {
    try {
      const gaEvent = message.gaEvent || {
        action: 'Paste',
        label: 'SimplePopup',
        actionMeta: 'simple'
      };
      try {
        const result = Action.paste({gaEvent: gaEvent});
        sendResponse({success: true, count: result.count});
      } catch (e) {
        console.error("Error in paste operation:", e);
        sendResponse({success: false, error: e.message || "Error pasting URLs"});
      }
    } catch (e) {
      console.error("Error handling paste action:", e);
      sendResponse({success: false, error: e.message});
    }
    return true;
  }
  
  return true;
});