import argparse
import re
# pyrefly: ignore [missing-import]
from youtube_transcript_api import YouTubeTranscriptApi

def count_word_in_video(video_id, target_word):
    try:
        print(f"Fetching transcript for video ID: {video_id}...")
        
        # Kept exactly as requested: Your working API call implementation
        transcript = YouTubeTranscriptApi().fetch(video_id, languages=['en', 'hi'])
        text = " ".join(item.text for item in transcript).lower()

        # Count exact occurrences using word boundaries (\b)
        count = len(re.findall(rf'\b{re.escape(target_word.lower())}\b', text))
        
        print("\n" + "="*40)
        print(f"Success! Analysis for video '{video_id}':")
        print(f"The word '{target_word}' appears {count} times.")
        print("="*40)

    except Exception as e:
        print(f"\nError: {e}")

if __name__ == '__main__':
    # Set up CLI argument parsing
    parser = argparse.ArgumentParser(description="Count occurrences of a specific word in a YouTube video transcript.")
    
    # Both arguments are now clean positional requirements
    parser.add_argument("video_id", help="The 11-character YouTube video ID (e.g., dQw4w9WgXcQ)")
    parser.add_argument("word", help="The specific word you want to count (e.g., 'right', 'like')")
    
    args = parser.parse_args()
    
    # Passes both arguments directly from the CLI input
    count_word_in_video(args.video_id, args.word)