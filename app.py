import os
import shutil
import yt_dlp
import urllib.parse
from flask import Flask, request, jsonify, render_template, send_from_directory
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('kiyload')

# ----------------------------
# Flask setup
# ----------------------------
app = Flask(__name__, template_folder='templates', static_folder='static')

# Centralized paths
DOWNLOAD_FOLDER = os.path.join(app.static_folder, 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)


# ----------------------------
# Helper: sanitize and download
# ----------------------------
def sanitize_filename(name: str) -> str:
    """Remove problematic characters from filenames."""
    # Keep only alphanumeric, spaces, and some safe chars
    safe = "".join(c for c in name if c.isalnum() or c in (" ", ".", "_", "-")).rstrip()
    # Replace multiple spaces with single space
    safe = ' '.join(safe.split())
    # Ensure the filename isn't too long for some filesystems
    if len(safe) > 200:
        safe = safe[:197] + "..."
    return safe


def _has_ffmpeg() -> bool:
    """Check whether ffmpeg is available on PATH."""
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if ffmpeg and ffprobe:
        logger.info(f"FFmpeg detected at: {ffmpeg}")
        return True
    logger.warning("FFmpeg not detected; falling back to progressive formats (audio codec may not be MP3).")
    return False

def download_with_yt_dlp(url: str) -> dict:
    """
    Download a video from the given URL and return metadata.
    Supports multiple formats with fallback.
    """
    # Prefer H.264 MP4 video + any audio, then best MP4 progressive as fallback
    # When FFmpeg is available, we will force MP3 audio on the merged file.
    use_ffmpeg = _has_ffmpeg()
    # Choose format string depending on FFmpeg availability
    if use_ffmpeg:
        # We can merge separate streams and transcode audio
        format_str = (
            "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio/best[ext=mp4]/best"
        )
    else:
        # No merging: insist on progressive MP4 that already contains audio
        # Fallback to any single file with audio if MP4 unavailable (warn user)
        format_str = "best[ext=mp4][acodec!=none]/best[acodec!=none]"

    ydl_opts = {
        # Constrain selection as above
        "format": format_str,
        "outtmpl": os.path.join(DOWNLOAD_FOLDER, "%(title)s.%(ext)s"),
        "quiet": True,
        "noplaylist": True,
        # Prefer ffmpeg if available (yt-dlp will handle merging/remuxing)
        "prefer_ffmpeg": use_ffmpeg,
    }

    if use_ffmpeg:
        # Ensure the final container is MP4 and the audio codec is MP3
        ydl_opts.update(
            {
                "merge_output_format": "mp4",
                # Pass FFmpeg args: copy video, transcode audio to MP3 at 192 kbps
                "postprocessor_args": [
                    "-c:v",
                    "copy",
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "192k",
                ],
            }
        )
    else:
        # Without FFmpeg, rely on progressive formats that already include audio
        # Note: audio codec will likely be AAC/Opus, not MP3.
        ydl_opts.pop("prefer_ffmpeg", None)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        
        # Get actual downloaded filename (may differ from prepared filename)
        # This handles cases where yt-dlp renamed the file due to conflicts
        actual_filename = os.path.basename(filename)
        
        # Check if the file exists with the expected name
        expected_path = os.path.join(DOWNLOAD_FOLDER, actual_filename)
        if not os.path.exists(expected_path):
            logger.warning(f"Expected file not found: {expected_path}")
            # Try looking for any matching file with a similar name
            mp4_files = [f for f in os.listdir(DOWNLOAD_FOLDER) if f.endswith(".mp4")]
            if mp4_files:
                # Sort by creation time, newest first
                mp4_files.sort(key=lambda x: os.path.getctime(os.path.join(DOWNLOAD_FOLDER, x)), reverse=True)
                actual_filename = mp4_files[0]
                logger.info(f"Using alternative file found: {actual_filename}")
        else:
            logger.info(f"Downloaded file found: {actual_filename}")
        
        # Make sure we have a clean, properly encoded URL
        safe_url = urllib.parse.quote(actual_filename)
        download_url = f"/static/downloads/{safe_url}"

    result = {
        "title": info.get("title"),
        "filename": actual_filename,
        "download_url": download_url,
        "ext": info.get("ext"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
        "audio_note": ("mp3" if use_ffmpeg else "progressive (codec may not be mp3)"),
    }

    # Add warnings when FFmpeg is missing or chosen format isn't MP4
    if not use_ffmpeg:
        ext = (info.get("ext") or "").lower()
        acodec = (info.get("acodec") or "").lower()
        if ext != "mp4" or acodec in ("opus", "vorbis"):
            result["warning"] = (
                "FFmpeg not detected. Downloaded a single-file format for compatibility; "
                "audio codec may be Opus/Vorbis and not play in some players. Install FFmpeg "
                "to get MP3 audio in an MP4 file."
            )

    return result


def extract_info_no_download(url: str) -> dict:
    """Extract video metadata and try to provide a preview URL without downloading."""
    ydl_opts = {
        "quiet": True,
        "noplaylist": True,
        # Try to get a single playable URL if possible
        "format": "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio/best",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        logger.error(f"Error extracting info: {str(e)}")
        raise

    # Determine preview URL
    preview_url = None
    if isinstance(info, dict):
        # Check for direct URL first
        preview_url = info.get("url")
        
        # If merged/requested formats provided, prefer mp4 progressive if present
        formats = info.get("requested_formats") or []
        if not preview_url and formats:
            # First try to get a video format with both audio and video
            for f in formats:
                if (f and f.get("url") and f.get("vcodec") != "none" and 
                    f.get("acodec") != "none"):
                    preview_url = f.get("url")
                    logger.info(f"Found combined a/v preview format: {f.get('format_id')}")
                    break
                    
            # If no combined format, get any format with video
            if not preview_url:
                for f in formats:
                    if f and f.get("url") and f.get("vcodec") != "none":
                        preview_url = f.get("url")
                        logger.info(f"Found video-only preview format: {f.get('format_id')}")
                        break
        
        # Fallback: scan all formats for a likely progressive mp4/webm
        if not preview_url:
            all_formats = info.get("formats") or []
            
            # First try formats with both video and audio
            for f in all_formats:
                if not f:
                    continue
                if (f.get("vcodec") != "none" and f.get("acodec") != "none" and
                    f.get("url")):
                    ext = (f.get("ext") or "").lower()
                    if ext in ("mp4", "webm"):
                        preview_url = f.get("url")
                        logger.info(f"Found fallback preview format: {f.get('format_id')}")
                        break
            
            # Last resort: any video format
            if not preview_url:
                for f in all_formats:
                    if not f:
                        continue
                    if f.get("vcodec") == "none":
                        continue
                    if f.get("url"):
                        preview_url = f.get("url")
                        logger.info(f"Found last-resort preview format: {f.get('format_id')}")
                        break

    return {
        "title": info.get("title"),
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
        "webpage_url": info.get("webpage_url"),
        "preview_url": preview_url,
    }


# ----------------------------
# Routes
# ----------------------------
@app.route("/")
def index():
    """Render the main page."""
    return render_template("index.html")

@app.route("/static/downloads/<path:filename>")
def download_file(filename):
    """Serve files with proper download headers."""
    # Decode the URL-encoded filename
    decoded_filename = urllib.parse.unquote(filename)
    
    # Create full path to the file
    file_path = os.path.join(DOWNLOAD_FOLDER, decoded_filename)
    
    # Check if file exists
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        return "File not found", 404
        
    # Always force download with Content-Disposition header
    return send_from_directory(
        directory=DOWNLOAD_FOLDER,
        path=decoded_filename,
        as_attachment=True,
        download_name=decoded_filename
    )


@app.route("/api/download", methods=["POST"])
def download_video():
    """API endpoint to handle the download request."""
    data = request.get_json(force=True)
    url = data.get("url")

    if not url:
        return jsonify({"error": "URL is required."}), 400

    try:
        result = download_with_yt_dlp(url)
        logger.info(f"Download successful: {result['filename']}")
        
        # Add Content-Disposition header suggestion to ensure browser offers download
        result['download_url'] = f"/static/downloads/{urllib.parse.quote(result['filename'])}?download=true"
        if result.get("audio_note") != "mp3":
            result["warning"] = (
                "Downloaded using progressive format. Audio codec may not be MP3 because FFmpeg was not detected."
            )
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Download failed: {str(e)}")
        return jsonify({"error": f"Download failed: {str(e)}"}), 500


@app.route("/api/info", methods=["POST"])
def info_video():
    """API endpoint to fetch metadata/preview for a URL without downloading."""
    data = request.get_json(force=True)
    url = data.get("url")
    if not url:
        return jsonify({"error": "URL is required."}), 400
    try:
        result = extract_info_no_download(url)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Info fetch failed: {str(e)}"}), 500


# ----------------------------
# Entry point
# ----------------------------
if __name__ == "__main__":
    # List existing downloads
    try:
        download_files = os.listdir(DOWNLOAD_FOLDER)
        logger.info(f"Found {len(download_files)} existing downloads: {download_files[:5]}")
    except Exception as e:
        logger.error(f"Error listing download folder: {str(e)}")
    
    # Run Flask with full logging
    app.run(debug=True)
