// Popup script
document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
  // Get elements
  const copyBtn = document.getElementById('copyBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const optionsBtn = document.getElementById('optionsBtn');
  const allWindowsCheck = document.getElementById('allWindowsCheck');
  const statusContainer = document.getElementById('statusContainer');
  const copyCurrentBtn = document.getElementById('copyCurrentBtn');
  
  // Default to checked - no storage used
  allWindowsCheck.checked = true;
  
  // Add click listeners
  copyBtn.addEventListener('click', function() {
    console.log('Copy button clicked');
    showStatus("Copying...", "blue");
    
    chrome.runtime.sendMessage({
      action: "copy",
      window: {}, // Will be filled by background script
      allWindows: allWindowsCheck.checked // Pass the setting directly
    }, function(response) {
      if (response && response.success) {
        showStatus("Copied " + (response.count || "all") + " URLs!", "green");
      } else {
        showStatus("Error copying URLs", "red");
      }
    });
  });
  
  copyCurrentBtn.addEventListener('click', function() {
    console.log('Copy Current Window button clicked');
    showStatus("Copying from current window...", "blue");
    chrome.windows.getCurrent(function(win) {
      chrome.runtime.sendMessage({
        action: "copy",
        window: win, // Pass the current window object
        allWindows: false // Only current window
      }, function(response) {
        if (response && response.success) {
          showStatus("Copied " + (response.count || "all") + " URLs from current window!", "green");
        } else {
          showStatus("Error copying URLs", "red");
        }
      });
    });
  });
  
  pasteBtn.addEventListener('click', function() {
    console.log('Paste button clicked');
    showStatus("Pasting...", "blue");
    
    chrome.runtime.sendMessage({
      action: "paste",
      intelligent: false // Simple line-by-line paste
    }, function(response) {
      if (response && response.success) {
        showStatus("Pasted " + (response.count || "all") + " URLs!", "green");
      } else if (response && response.error) {
        showStatus(response.error, "red");
      } else {
        showStatus("Done", "green");
      }
    });
  });
  
  // Options functionality has been removed
  optionsBtn.style.display = 'none';
  
  // Helper function to show status
  function showStatus(message, color) {
    statusContainer.textContent = message;
    statusContainer.style.color = color;
    statusContainer.style.backgroundColor = color === "red" ? "#ffeeee" : 
                                          color === "green" ? "#eeffee" : 
                                          "#eeeeff";
  }
});