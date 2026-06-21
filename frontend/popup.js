let currentVideoId = null;

function getYouTubeId(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("youtube.com")) {
      return urlObj.searchParams.get("v");
    } else if (urlObj.hostname.includes("youtu.be")) {
      return urlObj.pathname.substring(1);
    }
  } catch (e) { return null; }
  return null;
}

// 1. Initial configuration check on popup open
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
  const currentTab = tabs[0];
  const resultDiv = document.getElementById("result");
  const questionInput = document.getElementById("questionInput");
  const askBtn = document.getElementById("askBtn");

  if (currentTab && currentTab.url) {
    currentVideoId = getYouTubeId(currentTab.url);
    
    if (currentVideoId) {
      resultDiv.innerText = "Video detected! Type your question above.";
      questionInput.disabled = false;
      askBtn.disabled = false;
    } else {
      resultDiv.innerText = "Please navigate to a valid YouTube video page.";
    }
  } else {
    resultDiv.innerText = "Unable to read current tab.";
  }
});

// 2. Handle button click to fetch data from Flask backend
document.getElementById("askBtn").addEventListener("click", async () => {
  const question = document.getElementById("questionInput").value.trim();
  const resultDiv = document.getElementById("result");
  
  if (!question) return;

  resultDiv.innerText = "Analyzing transcript & generating answer...";
  
  try {
    const response = await fetch("http://127.0.0.1:5000/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        video_id: currentVideoId,
        question: question
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      resultDiv.innerText = data.answer;
    } else {
      resultDiv.innerText = `Error: ${data.error || "Something went wrong"}`;
    }
  } catch (error) {
    resultDiv.innerText = "Could not connect to Python backend. Ensure app.py is running.";
    console.error(error);
  }
});