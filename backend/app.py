# pyrefly: ignore [missing-import]
import os
import threading
from collections import OrderedDict
# pyrefly: ignore [missing-import]
from flask import Flask, request, jsonify
from flask_cors import CORS
# pyrefly: ignore [missing-import]
from youtube_transcript_api import YouTubeTranscriptApi
# pyrefly: ignore [missing-import]
from langchain_text_splitters import RecursiveCharacterTextSplitter
# pyrefly: ignore [missing-import]
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
# pyrefly: ignore [missing-import]
from langchain_chroma import Chroma
# pyrefly: ignore [missing-import]
from langchain_core.prompts import PromptTemplate
# pyrefly: ignore [missing-import]
from langchain_core.runnables import RunnablePassthrough
# pyrefly: ignore [missing-import]
from langchain_core.output_parsers import StrOutputParser
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
# Enable CORS for all routes and domains to ease Vercel deployment connection
CORS(app, resources={r"/*": {"origins": "*"}})

# Simple LRU cache for vectorstore retrievers to boost subsequent questions
MAX_CACHE_SIZE = 20
retriever_cache = OrderedDict()
cache_lock = threading.Lock()

def get_or_create_retriever(video_id):
    with cache_lock:
        if video_id in retriever_cache:
            # Move to end (most recently used)
            retriever_cache.move_to_end(video_id)
            return retriever_cache[video_id]

    # If not cached, fetch and build it
    # 1. Fetch transcript
    transcript = YouTubeTranscriptApi().fetch(video_id, languages=['en', 'hi'])
    text = " ".join(item.text for item in transcript)

    if not text.strip():
        raise ValueError("The transcript is empty.")

    # 2. Split text into chunks
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_text(text)

    # 3. Vector store and retriever
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    vectorstore = Chroma.from_texts(chunks, embeddings)
    retriever = vectorstore.as_retriever()

    with cache_lock:
        retriever_cache[video_id] = retriever
        if len(retriever_cache) > MAX_CACHE_SIZE:
            retriever_cache.popitem(last=False) # remove least recently used

    return retriever

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200

@app.route('/load', methods=['POST'])
def load_video():
    data = request.json or {}
    video_id = data.get('video_id')

    if not video_id:
        return jsonify({"error": "Missing video_id"}), 400

    try:
        # Pre-fetch and cache retriever
        get_or_create_retriever(video_id)
        return jsonify({"message": "Video transcript loaded and indexed successfully."}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to load transcript: {str(e)}"}), 500

@app.route('/ask', methods=['POST'])
def ask_video():
    data = request.json or {}
    video_id = data.get('video_id')
    question = data.get('question')

    if not video_id or not question:
        return jsonify({"error": "Missing video_id or question"}), 400

    try:
        # Get retriever from cache or construct it
        retriever = get_or_create_retriever(video_id)

        # 4. Prompt & LLM Setup
        prompt = PromptTemplate.from_template(
            "You are a helpful assistant answering questions about the following YouTube video transcript.\n\n"
            "Context from the transcript:\n{context}\n\n"
            "Question: {question}\n\n"
            "Provide a clear, detailed, and accurate answer based on the context. If the context does not contain the answer, use your general knowledge but state clearly that it is not explicitly mentioned in the video."
        )
        llm = ChatGoogleGenerativeAI(model="models/gemini-2.5-flash")

        # 5. RAG Chain
        chain = (
            {
                "context": retriever | (lambda docs: "\n\n".join(d.page_content for d in docs)),
                "question": RunnablePassthrough()
            }
            | prompt
            | llm
            | StrOutputParser()
        )

        # Run the chain
        answer = chain.invoke(question)
        return jsonify({"answer": answer})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Bind to PORT environment variable for Render compatibility
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)