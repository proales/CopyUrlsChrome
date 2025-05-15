// Popup script
document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
  // Get elements
  const copyBtn = document.getElementById('copyBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const allWindowsCheck = document.getElementById('allWindowsCheck');
  const statusContainer = document.getElementById('statusContainer');
  
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
  
  // Helper function to show status
  function showStatus(message, color) {
    statusContainer.textContent = message;
    statusContainer.style.color = color;
    statusContainer.style.backgroundColor = color === "red" ? "#ffeeee" : 
                                          color === "green" ? "#eeffee" : 
                                          "#eeeeff";
  }
});