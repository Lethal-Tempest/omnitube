// Configuration - Set your Render backend URL here for production deployment
const BACKEND_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://127.0.0.1:5000"
  : "https://omnitube.onrender.com"; // Updated with deployed Render URL

let currentVideoId = null;
let currentVideoTitle = "YouTube Video";

// DOM Elements
const setupView = document.getElementById("setupView");
const loadingView = document.getElementById("loadingView");
const workspaceView = document.getElementById("workspaceView");
const mainFooter = document.getElementById("mainFooter");

const urlForm = document.getElementById("urlForm");
const youtubeUrlInput = document.getElementById("youtubeUrl");
const validationError = document.getElementById("validationError");
const loadBtn = document.getElementById("loadBtn");

const loadingTitle = document.getElementById("loadingTitle");
const loadingStatus = document.getElementById("loadingStatus");
const progressFill = document.getElementById("progressFill");

const videoThumbnail = document.getElementById("videoThumbnail");
const videoTitle = document.getElementById("videoTitle");
const videoAuthor = document.getElementById("videoAuthor");
const changeVideoBtn = document.getElementById("changeVideoBtn");

const chatHistory = document.getElementById("chatHistory");
const chatForm = document.getElementById("chatForm");
const questionInput = document.getElementById("questionInput");

// Textarea auto-resize listener
questionInput.addEventListener("input", function() {
  this.style.height = "auto";
  this.style.height = (this.scrollHeight - 10) + "px";
});

// Helper: Extract YouTube video ID
function getYouTubeId(url) {
  if (!url) return null;
  url = url.trim();
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper: Fetch YouTube oEmbed metadata for title and publisher details
async function fetchVideoDetails(videoId) {
  try {
    const oEmbedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(oEmbedUrl);
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || "YouTube Video",
        author: data.author_name || "YouTube Creator"
      };
    }
  } catch (e) {
    console.error("Could not fetch video details from oEmbed:", e);
  }
  return { title: "YouTube Video", author: "YouTube Creator" };
}

// Helper: Format simple markdown in API response
function formatMarkdown(text) {
  if (!text) return "";
  
  // Escape HTML to prevent injection
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
    
  // Bold formatting: **text** -> <strong>text</strong>
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  
  // Code block: `code` -> <code>code</code>
  escaped = escaped.replace(/`(.*?)`/g, "<code>$1</code>");
  
  // Split lines for bullets and paragraphs
  const lines = escaped.split("\n");
  let inList = false;
  let html = "";
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${trimmed.substring(2)}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      if (trimmed === "") {
        html += "<br>";
      } else {
        html += `<p>${line}</p>`;
      }
    }
  }
  
  if (inList) {
    html += "</ul>";
  }
  
  return html;
}

// Action: Show views
function showView(viewId) {
  setupView.classList.add("hidden");
  loadingView.classList.add("hidden");
  workspaceView.classList.add("hidden");
  
  if (viewId === "setup") {
    setupView.classList.remove("hidden");
    mainFooter.classList.remove("hidden");
  } else if (viewId === "loading") {
    loadingView.classList.remove("hidden");
    mainFooter.classList.add("hidden");
  } else if (viewId === "workspace") {
    workspaceView.classList.remove("hidden");
    mainFooter.classList.add("hidden");
  }
}

// Action: Add Chat Message Bubble
function appendMessage(sender, text, isMarkdown = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  
  const metaDiv = document.createElement("div");
  metaDiv.className = "message-meta";
  metaDiv.innerText = sender === "user" ? "You" : "Assistant AI";
  
  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "message-bubble";
  
  if (isMarkdown) {
    bubbleDiv.innerHTML = formatMarkdown(text);
  } else {
    bubbleDiv.innerText = text;
  }
  
  messageDiv.appendChild(metaDiv);
  messageDiv.appendChild(bubbleDiv);
  chatHistory.appendChild(messageDiv);
  
  // Scroll to bottom
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return messageDiv;
}

// Action: Add Loading Indicator Bubble
function appendTypingIndicator() {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message assistant typing-bubble";
  
  const metaDiv = document.createElement("div");
  metaDiv.className = "message-meta";
  metaDiv.innerText = "Assistant AI";
  
  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "message-bubble";
  
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  
  bubbleDiv.appendChild(indicator);
  messageDiv.appendChild(metaDiv);
  messageDiv.appendChild(bubbleDiv);
  chatHistory.appendChild(messageDiv);
  
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return messageDiv;
}

// Event: Submit YouTube URL form
urlForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  validationError.innerText = "";
  
  const url = youtubeUrlInput.value;
  const videoId = getYouTubeId(url);
  
  if (!videoId) {
    validationError.innerText = "Please enter a valid YouTube video URL.";
    return;
  }
  
  currentVideoId = videoId;
  
  // Enter loading state
  showView("loading");
  loadingTitle.innerText = "Connecting to YouTube...";
  loadingStatus.innerText = "Fetching the video transcript and metadata. Please hold on...";
  
  // Trigger fetch metadata and backend call simultaneously
  const metadataPromise = fetchVideoDetails(videoId);
  
  try {
    const backendPromise = fetch(`${BACKEND_URL}/load`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ video_id: videoId })
    });
    
    // Wait for both requests
    const [metaRes, backendRes] = await Promise.all([metadataPromise, backendPromise]);
    
    if (!backendRes.ok) {
      const errData = await backendRes.json().catch(() => ({}));
      throw new Error(errData.error || "Could not retrieve transcript. Check if transcript is disabled or video is private.");
    }
    
    // Successfully loaded transcript
    currentVideoTitle = metaRes.title;
    
    // Set Sidebar Details
    videoThumbnail.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    videoTitle.innerText = metaRes.title;
    videoAuthor.innerText = metaRes.author;
    
    // Transition to Workspace View
    showView("workspace");
    
    // Clear chat history & add system message
    chatHistory.innerHTML = "";
    appendMessage("assistant", "Video transcript loaded successfully! Ask me anything about this video's contents, and I'll analyze it for you.");
    
  } catch (error) {
    console.error(error);
    showView("setup");
    validationError.innerText = error.message || "Failed to establish contact with the AI backend. Check connection.";
  }
});

// Event: Submit chat question
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const question = questionInput.value.trim();
  if (!question) return;
  
  // Reset input field height and clear text
  questionInput.value = "";
  questionInput.style.height = "auto";
  
  // Append user bubble
  appendMessage("user", question);
  
  // Append temporary loading bubble
  const typingIndicatorBubble = appendTypingIndicator();
  
  try {
    const response = await fetch(`${BACKEND_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        video_id: currentVideoId,
        question: question
      })
    });
    
    // Remove the typing bubble
    typingIndicatorBubble.remove();
    
    const data = await response.json();
    if (response.ok) {
      appendMessage("assistant", data.answer, true);
    } else {
      appendMessage("assistant", `Error: ${data.error || "Unable to extract answer."}`);
    }
  } catch (error) {
    console.error(error);
    if (typingIndicatorBubble) typingIndicatorBubble.remove();
    appendMessage("assistant", "Network Error: Could not reach the server backend. Please verify if your local or deployed Flask app is running.");
  }
});

// Event: Click back / Change Video
changeVideoBtn.addEventListener("click", () => {
  currentVideoId = null;
  youtubeUrlInput.value = "";
  validationError.innerText = "";
  showView("setup");
});
